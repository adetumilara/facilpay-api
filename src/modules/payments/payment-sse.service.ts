import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Payment, PaymentStatus } from './payment.entity';

const TERMINAL_STATES = new Set([
  PaymentStatus.COMPLETED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
]);

@Injectable()
export class PaymentSseService {
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  subscribe(paymentId: string): Observable<MessageEvent> {
    if (!this.subjects.has(paymentId)) {
      this.subjects.set(paymentId, new Subject<MessageEvent>());
    }
    return this.subjects.get(paymentId)!.asObservable();
  }

  emit(payment: Payment): void {
    const subject = this.subjects.get(payment.id);
    if (!subject) return;

    subject.next({
      data: {
        id: payment.id,
        status: payment.status,
        updatedAt: payment.updatedAt,
      },
      type: 'payment.status_updated',
    });

    if (TERMINAL_STATES.has(payment.status)) {
      subject.complete();
      this.subjects.delete(payment.id);
    }
  }
}
