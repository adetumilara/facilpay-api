import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { LoginEvent, LoginFailureReason } from './entities/login-event.entity';

const LOGIN_HISTORY_RETENTION_DAYS = 90;

export interface RecordLoginEventParams {
  userId: string | null;
  success: boolean;
  reason?: LoginFailureReason;
  ipAddress?: string;
  userAgent?: string;
  country?: string;
}

@Injectable()
export class LoginHistoryService {
  constructor(
    @InjectRepository(LoginEvent)
    private readonly loginEventRepository: Repository<LoginEvent>,
  ) {}

  async record(params: RecordLoginEventParams): Promise<LoginEvent> {
    const event = this.loginEventRepository.create({
      userId: params.userId ?? null,
      success: params.success,
      reason: params.reason ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      country: params.country ?? null,
    });
    return this.loginEventRepository.save(event);
  }

  async findForUser(
    userId: string,
    options: { page?: number; limit?: number; failuresOnly?: boolean },
  ): Promise<{ data: LoginEvent[]; total: number; page: number; limit: number }> {
    const retentionCutoff = new Date(
      Date.now() - LOGIN_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      userId,
      createdAt: MoreThan(retentionCutoff),
    };
    if (options.failuresOnly) {
      where['success'] = false;
    }

    const [data, total] = await this.loginEventRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Purge login events older than the retention window. Intended to be called
   * by a scheduled task.
   */
  async purgeOldEvents(): Promise<number> {
    const cutoff = new Date(
      Date.now() - LOGIN_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.loginEventRepository.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }
}
