import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../payments/payment.entity';
import { MerchantLimit } from './entities/merchant-limit.entity';
import { UpsertMerchantLimitsDto } from './dto/upsert-merchant-limits.dto';

export type MerchantLimitWarning = {
    limitType: 'single payment' | 'daily volume' | 'monthly volume';
    limit: number;
    currentVolume: number;
};

@Injectable()
export class MerchantLimitsService {
    constructor(
        @InjectRepository(MerchantLimit)
        private readonly limitsRepository: Repository<MerchantLimit>,
        @InjectRepository(Payment)
        private readonly paymentsRepository: Repository<Payment>,
    ) { }

    async upsert(
        merchantId: string,
        dto: UpsertMerchantLimitsDto,
    ): Promise<MerchantLimit> {
        const current = await this.limitsRepository.findOneBy({
            merchantId,
            currency: dto.currency,
        });
        const limit = current ?? this.limitsRepository.create({
            merchantId,
            currency: dto.currency,
            maxSinglePayment: null,
            dailyVolume: null,
            monthlyVolume: null,
        });

        if (dto.maxSinglePayment !== undefined) limit.maxSinglePayment = dto.maxSinglePayment;
        if (dto.dailyVolume !== undefined) limit.dailyVolume = dto.dailyVolume;
        if (dto.monthlyVolume !== undefined) limit.monthlyVolume = dto.monthlyVolume;

        return this.limitsRepository.save(limit);
    }

    async getForMerchant(merchantId: string): Promise<MerchantLimit[]> {
        return this.limitsRepository.find({
            where: { merchantId },
            order: { currency: 'ASC' },
        });
    }

    async getForCurrency(
        merchantId: string,
        currency: string,
    ): Promise<MerchantLimit | null> {
        return this.limitsRepository.findOneBy({ merchantId, currency });
    }

    async enforce(
        merchantId: string | null | undefined,
        currency: string,
        amount: number,
        manager?: EntityManager,
        batchTotals?: Map<string, number>,
    ): Promise<MerchantLimitWarning[]> {
        if (!merchantId) return [];

        const limitsRepository = manager
            ? manager.getRepository(MerchantLimit)
            : this.limitsRepository;
        const paymentsRepository = manager
            ? manager.getRepository(Payment)
            : this.paymentsRepository;

        if (manager) {
            await manager.query(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                [`merchant-limits:${merchantId}`, currency],
            );
        }

        const limit = await limitsRepository.findOneBy({ merchantId, currency });
        if (!limit) return [];

        const amountNumber = Number(amount);
        if (
            limit.maxSinglePayment !== null &&
            amountNumber > Number(limit.maxSinglePayment)
        ) {
            throw new UnprocessableEntityException(
                `Payment amount ${amountNumber} exceeds the ${currency} single-payment limit of ${limit.maxSinglePayment}`,
            );
        }

        const now = new Date();
        const dayStart = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        ));
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const dailyVolume = await this.sumSince(paymentsRepository, merchantId, currency, dayStart);
        const monthlyVolume = await this.sumSince(paymentsRepository, merchantId, currency, monthStart);
        const key = `${merchantId}:${currency}`;
        const batchTotal = batchTotals?.get(key) ?? 0;
        const beforeDaily = dailyVolume + batchTotal;
        const beforeMonthly = monthlyVolume + batchTotal;

        if (
            limit.dailyVolume !== null &&
            beforeDaily + amountNumber > Number(limit.dailyVolume)
        ) {
            throw new UnprocessableEntityException(
                `Payment would exceed the ${currency} daily volume limit of ${limit.dailyVolume}`,
            );
        }
        if (
            limit.monthlyVolume !== null &&
            beforeMonthly + amountNumber > Number(limit.monthlyVolume)
        ) {
            throw new UnprocessableEntityException(
                `Payment would exceed the ${currency} monthly volume limit of ${limit.monthlyVolume}`,
            );
        }

        batchTotals?.set(key, batchTotal + amountNumber);
        const warnings: MerchantLimitWarning[] = [];
        if (
            limit.maxSinglePayment !== null &&
            amountNumber >= Number(limit.maxSinglePayment) * 0.8
        ) {
            warnings.push({
                limitType: 'single payment',
                limit: Number(limit.maxSinglePayment),
                currentVolume: amountNumber,
            });
        }
        if (
            limit.dailyVolume !== null &&
            beforeDaily < Number(limit.dailyVolume) * 0.8 &&
            beforeDaily + amountNumber >= Number(limit.dailyVolume) * 0.8
        ) {
            warnings.push({
                limitType: 'daily volume',
                limit: Number(limit.dailyVolume),
                currentVolume: beforeDaily + amountNumber,
            });
        }
        if (
            limit.monthlyVolume !== null &&
            beforeMonthly < Number(limit.monthlyVolume) * 0.8 &&
            beforeMonthly + amountNumber >= Number(limit.monthlyVolume) * 0.8
        ) {
            warnings.push({
                limitType: 'monthly volume',
                limit: Number(limit.monthlyVolume),
                currentVolume: beforeMonthly + amountNumber,
            });
        }
        return warnings;
    }

    private async sumSince(
        repository: Repository<Payment>,
        merchantId: string,
        currency: string,
        since: Date,
    ): Promise<number> {
        const result = await repository
            .createQueryBuilder('payment')
            .select('COALESCE(SUM(payment.amount), 0)', 'sum')
            .where('payment.merchantId = :merchantId', { merchantId })
            .andWhere('payment.currency = :currency', { currency })
            .andWhere('payment.createdAt >= :since', { since })
            .getRawOne<{ sum: string }>();
        return Number(result?.sum ?? 0);
    }
}