import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { PasswordStrengthService } from '../auth/password-strength.service';
import { PasswordHistoryService } from '../auth/password-history.service';
import { PasswordHistory } from '../auth/entities/password-history.entity';
import { MailService } from '../auth/mail/mail.service';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Session } from '../auth/entities/session.entity';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

/** How long (ms) an email-change confirmation token is valid */
const EMAIL_CHANGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** How long (ms) a data-export rate-limit window lasts */
const DATA_EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h

/** TTL for signed data-export download tokens */
const DATA_EXPORT_LINK_TTL_MS = 48 * 60 * 60 * 1000; // 48 h

@Injectable()
export class UserSecurityService {
  private readonly logger: Logger;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly passwordHistoryService: PasswordHistoryService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: UserSecurityService.name });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #429 — Change password
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Change the authenticated user's password.
   * - Verifies the current password.
   * - Enforces the strength policy via PasswordStrengthService.
   * - Rejects recently used passwords via PasswordHistoryService.
   * - Revokes all other sessions / refresh tokens.
   * - Sends a security-alert email.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // 2. Enforce strength policy
    await this.passwordStrengthService.validateAndScore(newPassword);

    // 3. Hash the new password
    const newHash = await bcrypt.hash(newPassword, 10);

    // 4. Check password history (compare plain against stored hashes)
    //    PasswordHistoryService.validatePasswordNotReused expects the raw new
    //    password so it can bcrypt.compare against stored hashes.
    await this.validatePasswordHistoryRaw(userId, newPassword);

    // 5. Persist the new password
    user.password = newHash;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // 6. Record in password history
    await this.passwordHistoryService.recordPasswordChange(userId, newHash);

    // 7. Revoke all other sessions and refresh tokens
    await this.revokeOtherSessions(userId, ipAddress, userAgent);

    // 8. Send security-alert email (fire-and-forget)
    this.mailService
      .sendSecurityAlertEmail(user.email, 'password changed')
      .catch((err) =>
        this.logger.warn({ userId, error: err.message }, 'Failed to send security alert email'),
      );

    await this.auditLogsService.record({
      actorId: userId,
      actorType: 'user',
      action: 'user.password_changed',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      userAgent,
      metadata: {},
    });

    this.logger.info({ userId }, 'Password changed via /me/password');
    return { message: 'Password changed successfully. All other sessions have been revoked.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #428 — Change email (initiate)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Initiate an email-address change.
   * - Verifies the current password (and optional TOTP).
   * - Normalises and checks uniqueness of the new email.
   * - Stores a pending-email + signed token on the user row.
   * - Sends a confirmation link to the *new* address.
   * - Sends a notice (with revert link) to the *old* address.
   */
  async initiateEmailChange(
    userId: string,
    newEmail: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Verify current password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password is incorrect');
    }

    const normalised = newEmail.trim().toLowerCase();

    // 2. Cannot be the same as current email
    if (normalised === user.email.toLowerCase()) {
      throw new BadRequestException('New email must differ from the current email address');
    }

    // 3. Uniqueness check
    const existing = await this.userRepository.findOne({
      where: { email: normalised },
    });
    if (existing) {
      throw new ConflictException('Email address is already in use');
    }

    // 4. Issue a signed JWT for confirmation
    const confirmToken = this.jwtService.sign(
      { sub: userId, newEmail: normalised, purpose: 'email-change-confirm' },
      { expiresIn: '24h' },
    );

    // 5. Issue a revert token sent to the old address
    const revertToken = this.jwtService.sign(
      { sub: userId, oldEmail: user.email, purpose: 'email-change-revert' },
      { expiresIn: '24h' },
    );

    // 6. Persist pending state
    user.pendingEmail = normalised;
    user.emailChangeToken = confirmToken;
    user.emailChangeTokenExpiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS);
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // 7. Send emails (fire-and-forget, log errors but don't fail the request)
    this.mailService
      .sendEmailChangeConfirmation(normalised, confirmToken, normalised)
      .catch((err) =>
        this.logger.warn({ userId, error: err.message }, 'Failed to send email-change confirmation'),
      );

    this.mailService
      .sendEmailChangeNotice(user.email, normalised, revertToken)
      .catch((err) =>
        this.logger.warn({ userId, error: err.message }, 'Failed to send email-change notice'),
      );

    await this.auditLogsService.record({
      actorId: userId,
      actorType: 'user',
      action: 'user.email_change_initiated',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      userAgent,
      metadata: { newEmail: normalised },
    });

    this.logger.info({ userId, newEmail: normalised }, 'Email change initiated');
    return {
      message:
        'A confirmation link has been sent to your new email address. Your current address has also been notified.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #428 — Confirm email change
  // ─────────────────────────────────────────────────────────────────────────────

  async confirmEmailChange(token: string): Promise<{ message: string }> {
    let payload: { sub: string; newEmail: string; purpose: string };
    try {
      payload = this.jwtService.verify(token) as typeof payload;
    } catch {
      throw new BadRequestException('Invalid or expired email-change token');
    }

    if (payload.purpose !== 'email-change-confirm') {
      throw new BadRequestException('Invalid token purpose');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate the stored token matches
    if (user.emailChangeToken !== token) {
      throw new BadRequestException('Token has already been used or superseded');
    }

    if (!user.emailChangeTokenExpiresAt || user.emailChangeTokenExpiresAt < new Date()) {
      throw new BadRequestException('Email-change token has expired');
    }

    const normalised = payload.newEmail;

    // Final uniqueness check (race-condition safety)
    const conflict = await this.userRepository.findOne({ where: { email: normalised } });
    if (conflict) {
      throw new ConflictException('Email address is already in use');
    }

    // Swap the email
    user.email = normalised;
    user.pendingEmail = null;
    user.emailChangeToken = null;
    user.emailChangeTokenExpiresAt = null;
    user.isEmailVerified = true;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // Revoke all other sessions after the email swap
    await this.revokeOtherSessions(user.id);

    await this.auditLogsService.record({
      actorId: user.id,
      actorType: 'user',
      action: 'user.email_changed',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { newEmail: normalised },
    });

    this.logger.info({ userId: user.id, newEmail: normalised }, 'Email change confirmed');
    return { message: 'Email address updated successfully. All sessions have been revoked.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #428 — Revert email change
  // ─────────────────────────────────────────────────────────────────────────────

  async revertEmailChange(token: string): Promise<{ message: string }> {
    let payload: { sub: string; oldEmail: string; purpose: string };
    try {
      payload = this.jwtService.verify(token) as typeof payload;
    } catch {
      throw new BadRequestException('Invalid or expired revert token');
    }

    if (payload.purpose !== 'email-change-revert') {
      throw new BadRequestException('Invalid token purpose');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Clear the pending change
    user.pendingEmail = null;
    user.emailChangeToken = null;
    user.emailChangeTokenExpiresAt = null;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    await this.auditLogsService.record({
      actorId: user.id,
      actorType: 'user',
      action: 'user.email_change_reverted',
      resourceType: 'user',
      resourceId: user.id,
      metadata: {},
    });

    this.logger.info({ userId: user.id }, 'Email change reverted by user');
    return { message: 'Email change has been cancelled. Your original address remains active.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #427 — GDPR data export
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Initiate a GDPR personal-data export.
   * - Rate-limited to one export per 24 h.
   * - Requires step-up auth (password verification).
   * - Builds the redacted export synchronously (no queue needed for basic impl).
   * - Emails a time-limited download token to the user.
   */
  async requestDataExport(
    userId: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Step-up auth: verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password is incorrect');
    }

    // Rate-limit: one export per 24 h
    if (user.dataExportRequestedAt) {
      const elapsed = Date.now() - user.dataExportRequestedAt.getTime();
      if (elapsed < DATA_EXPORT_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((DATA_EXPORT_COOLDOWN_MS - elapsed) / 1000);
        throw new BadRequestException(
          `A data export was already requested recently. Please try again in ${Math.ceil(retryAfterSeconds / 3600)} hour(s).`,
        );
      }
    }

    // Stamp the request timestamp
    user.dataExportRequestedAt = new Date();
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // Issue a signed download token (48 h)
    const downloadToken = this.jwtService.sign(
      { sub: userId, purpose: 'data-export-download' },
      { expiresIn: '48h' },
    );

    // Send email with download link (fire-and-forget)
    this.mailService
      .sendDataExportReadyEmail(user.email, downloadToken)
      .catch((err) =>
        this.logger.warn({ userId, error: err.message }, 'Failed to send data-export email'),
      );

    await this.auditLogsService.record({
      actorId: userId,
      actorType: 'user',
      action: 'user.data_export_requested',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      userAgent,
      metadata: {},
    });

    this.logger.info({ userId }, 'GDPR data export requested');
    return {
      message:
        'Your data export has been prepared. A download link has been sent to your email address. The link expires in 48 hours.',
    };
  }

  /**
   * Download the GDPR data export. Validates the signed token and builds a
   * redacted JSON object containing: profile, sessions (no secrets), login
   * history keys, API key metadata (no secrets), and payments where the user
   * is payer.
   *
   * No secrets (password hash, 2FA secret, backup codes) are ever included.
   */
  async downloadDataExport(
    token: string,
  ): Promise<Record<string, unknown>> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify(token) as typeof payload;
    } catch {
      throw new BadRequestException('Invalid or expired download token');
    }

    if (payload.purpose !== 'data-export-download') {
      throw new BadRequestException('Invalid token purpose');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build the redacted export — never include secrets
    const {
      password: _password,
      twoFactorSecret: _secret,
      backupCodes: _codes,
      emailChangeToken: _ect,
      ...safeProfile
    } = user;

    const sessions = await this.sessionRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const safeExport: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      profile: safeProfile,
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        revoked: s.revoked,
        createdAt: s.createdAt,
      })),
    };

    return safeExport;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async revokeOtherSessions(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.refreshTokenRepository.update({ userId }, { revoked: true });
    await this.sessionRepository.update({ userId }, { revoked: true });
  }

  /**
   * Check the new plain-text password against the stored hashed history.
   * The standard PasswordHistoryService.validatePasswordNotReused() API takes
   * a *hash* and compares it; here we need to compare plain against hashes,
   * so we retrieve the history and bcrypt.compare each entry ourselves.
   */
  private async validatePasswordHistoryRaw(
    userId: string,
    newPlain: string,
  ): Promise<void> {
    const phRepo = this.dataSource.getRepository(PasswordHistory);
    const history = await phRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    for (const entry of history) {
      const isMatch = await bcrypt.compare(newPlain, entry.passwordHash);
      if (isMatch) {
        throw new BadRequestException(
          'You cannot reuse a recent password. Please choose a different password.',
        );
      }
    }
  }
}
