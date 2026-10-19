import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  register,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly bullmqQueueDepth: Gauge;
  private readonly bullmqFailedCount: Counter;
  private readonly paymentsCreatedTotal: Counter;
  private readonly paymentsCompletedTotal: Counter;
  private readonly webhookDeliverySuccess: Counter;
  private readonly webhookDeliveryFailure: Counter;

  constructor() {
    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register });

    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    // BullMQ metrics
    this.bullmqQueueDepth = new Gauge({
      name: 'bullmq_queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name'],
    });

    this.bullmqFailedCount = new Counter({
      name: 'bullmq_jobs_failed_total',
      help: 'Total failed BullMQ jobs',
      labelNames: ['queue_name'],
    });

    // Payment metrics
    this.paymentsCreatedTotal = new Counter({
      name: 'payments_created_total',
      help: 'Total payments created',
      labelNames: ['currency'],
    });

    this.paymentsCompletedTotal = new Counter({
      name: 'payments_completed_total',
      help: 'Total payments completed',
      labelNames: ['currency', 'status'],
    });

    // Webhook metrics
    this.webhookDeliverySuccess = new Counter({
      name: 'webhook_delivery_success_total',
      help: 'Total successful webhook deliveries',
      labelNames: ['event_type'],
    });

    this.webhookDeliveryFailure = new Counter({
      name: 'webhook_delivery_failure_total',
      help: 'Total failed webhook deliveries',
      labelNames: ['event_type', 'status_code'],
    });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration,
    );
    this.httpRequestTotal.inc({ method, route, status_code: statusCode });
  }

  setQueueDepth(queueName: string, depth: number) {
    this.bullmqQueueDepth.set({ queue_name: queueName }, depth);
  }

  recordFailedJob(queueName: string) {
    this.bullmqFailedCount.inc({ queue_name: queueName });
  }

  recordPaymentCreated(currency: string) {
    this.paymentsCreatedTotal.inc({ currency });
  }

  recordPaymentCompleted(currency: string, status: string) {
    this.paymentsCompletedTotal.inc({ currency, status });
  }

  recordWebhookDeliverySuccess(eventType: string) {
    this.webhookDeliverySuccess.inc({ event_type: eventType });
  }

  recordWebhookDeliveryFailure(eventType: string, statusCode: number) {
    this.webhookDeliveryFailure.inc({ event_type: eventType, status_code: statusCode });
  }

  getMetrics(): string {
    return register.metrics();
  }
}
