import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount, LedgerEntry } from './ledger-entry.entity';
import {
  appendLedgerTransaction,
  LedgerTransactionInput,
} from './ledger-transaction';
import { GetLedgerEntriesDto } from './dto/get-ledger-entries.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export interface LedgerBalance {
  currency: string;
  account: LedgerAccount;
  balance: string;
}

export interface LedgerConsistencyReport {
  checkedAt: Date;
  unbalancedTransactions: Array<{
    transactionId: string;
    amount: string;
  }>;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepository: Repository<LedgerEntry>,
  ) {}

  async append(input: LedgerTransactionInput): Promise<LedgerEntry[]> {
    return appendLedgerTransaction(this.ledgerRepository.manager, input);
  }

  async getBalance(
    merchantId: string,
    currency?: string,
  ): Promise<{ merchantId: string; balances: LedgerBalance[] }> {
    const query = this.ledgerRepository
      .createQueryBuilder('entry')
      .select('entry.currency', 'currency')
      .addSelect('entry.account', 'account')
      .addSelect('COALESCE(SUM(entry.amount), 0)', 'balance')
      .where('entry.merchantId = :merchantId', { merchantId })
      .groupBy('entry.currency')
      .addGroupBy('entry.account')
      .orderBy('entry.currency', 'ASC')
      .addOrderBy('entry.account', 'ASC');

    if (currency) {
      query.andWhere('entry.currency = :currency', {
        currency: currency.toUpperCase(),
      });
    }

    const rows = await query.getRawMany<{
      currency: string;
      account: LedgerAccount;
      balance: string;
    }>();

    return {
      merchantId,
      balances: rows.map((row) => ({
        currency: row.currency,
        account: row.account,
        balance: String(row.balance),
      })),
    };
  }

  async findLedger(
    merchantId: string,
    dto: GetLedgerEntriesDto,
  ): Promise<PaginatedResult<LedgerEntry>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const query = this.ledgerRepository
      .createQueryBuilder('entry')
      .where('entry.merchantId = :merchantId', { merchantId });

    if (dto.currency) {
      query.andWhere('entry.currency = :currency', {
        currency: dto.currency.toUpperCase(),
      });
    }
    if (dto.account) {
      query.andWhere('entry.account = :account', { account: dto.account });
    }
    if (dto.referenceType) {
      query.andWhere('entry.referenceType = :referenceType', {
        referenceType: dto.referenceType,
      });
    }
    if (dto.from) {
      query.andWhere('entry.createdAt >= :from', { from: new Date(dto.from) });
    }
    if (dto.to) {
      query.andWhere('entry.createdAt <= :to', { to: new Date(dto.to) });
    }

    const [data, total] = await query
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async checkConsistency(): Promise<LedgerConsistencyReport> {
    const rows = await this.ledgerRepository
      .createQueryBuilder('entry')
      .select('entry.transactionId', 'transactionId')
      .addSelect('SUM(entry.amount)', 'amount')
      .groupBy('entry.transactionId')
      .having('SUM(entry.amount) <> 0')
      .getRawMany<{ transactionId: string; amount: string }>();

    const report: LedgerConsistencyReport = {
      checkedAt: new Date(),
      unbalancedTransactions: rows.map((row) => ({
        transactionId: row.transactionId,
        amount: String(row.amount),
      })),
    };

    if (report.unbalancedTransactions.length > 0) {
      this.logger.error(
        `Ledger consistency check found ${report.unbalancedTransactions.length} unbalanced transaction(s)`,
      );
    } else {
      this.logger.debug('Ledger consistency check passed');
    }

    return report;
  }

  @Cron('0 3 * * *')
  async scheduledConsistencyCheck(): Promise<void> {
    await this.checkConsistency();
  }
}
