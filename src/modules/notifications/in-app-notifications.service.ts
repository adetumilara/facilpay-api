import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InAppNotification } from './in-app-notification.entity';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';

export interface CreateInAppNotificationDto {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

@Injectable()
export class InAppNotificationsService {
  private readonly logger: Logger;

  constructor(
    @InjectRepository(InAppNotification)
    private readonly repo: Repository<InAppNotification>,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: InAppNotificationsService.name });
  }

  async create(dto: CreateInAppNotificationDto): Promise<InAppNotification> {
    const notification = this.repo.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      link: dto.link ?? null,
    });
    return this.repo.save(notification);
  }

  async findForUser(
    userId: string,
    unreadOnly?: boolean,
  ): Promise<InAppNotification[]> {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .limit(50);

    if (unreadOnly) {
      qb.andWhere('n.readAt IS NULL');
    }

    return qb.getMany();
  }

  async markRead(id: string, userId: string): Promise<InAppNotification> {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.readAt) {
      return notification;
    }
    notification.readAt = new Date();
    return this.repo.save(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(InAppNotification)
      .set({ readAt: new Date() })
      .where('userId = :userId AND readAt IS NULL', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.repo.count({
      where: { userId, readAt: null as any },
    });
    return { count };
  }
}
