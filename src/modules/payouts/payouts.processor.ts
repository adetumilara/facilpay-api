import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PAYOUTS_QUEUE, PayoutsService } from './payouts.service';

export interface ProcessPayoutJobData {
  payoutId: string;
}

@Processor(PAYOUTS_QUEUE)
@Injectable()
export class PayoutsProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutsProcessor.name);

  constructor(private readonly payoutsService: PayoutsService) {
    super();
  }

  async process(job: Job<ProcessPayoutJobData>): Promise<{ status: string | null }> {
    const payout = await this.payoutsService.process(job.data.payoutId);
    return { status: payout?.status ?? null };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ProcessPayoutJobData>, error: Error) {
    this.logger.error(`Payout job ${job.id} failed: ${error.message}`);
  }
}
