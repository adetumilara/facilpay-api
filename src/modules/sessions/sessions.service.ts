import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Session } from './session.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

const SESSION_DURATION_DAYS = 30;

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: {
      deviceFingerprint?: string | null;
      countryCode?: string | null;
    },
  ): Promise<Session> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    const session = this.sessionRepository.create({
      userId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      deviceInfo: userAgent ?? 'Unknown device',
      deviceFingerprint: metadata?.deviceFingerprint ?? null,
      countryCode: metadata?.countryCode ?? null,
      lastActiveAt: now,
      expiresAt,
      revoked: false,
    });

    return this.sessionRepository.save(session);
  }

  async touchSession(
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Session | null> {
    const session = await this.sessionRepository.findOneBy({ id: sessionId });
    if (!session) return null;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    session.lastActiveAt = now;
    session.expiresAt = expiresAt;
    if (ipAddress) session.ipAddress = ipAddress;
    if (userAgent) session.userAgent = userAgent;

    return this.sessionRepository.save(session);
  }

  async findAllActiveForUser(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { userId, revoked: false, expiresAt: MoreThan(new Date()) },
      order: { lastActiveAt: 'DESC' },
    });
  }

  async revokeForUser(sessionId: string, userId: string): Promise<void> {
    const session = await this.sessionRepository.findOneBy({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException();
    }

    session.revoked = true;
    await this.sessionRepository.save(session);

    await this.refreshTokenRepository.update(
      { sessionId: session.id },
      { revoked: true },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionRepository.update(
      { userId, revoked: false },
      { revoked: true },
    );
    await this.refreshTokenRepository.update({ userId }, { revoked: true });
  }
}
