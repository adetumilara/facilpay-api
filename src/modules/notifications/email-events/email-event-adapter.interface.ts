export enum EmailDeliveryEventType {
  DELIVERED = 'delivered',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
}

export interface NormalizedEmailEvent {
  type: EmailDeliveryEventType;
  email: string;
  /** Message-ID of the original email, when the provider reports it. */
  messageId?: string;
  /** Only set for bounces. Soft bounces are recorded but never suppress. */
  bounceType?: 'hard' | 'soft';
  reason?: string;
  occurredAt: Date;
}

export interface EmailWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | string;
  body: unknown;
}

export interface EmailEventAdapter {
  readonly provider: string;
  verify(request: EmailWebhookRequest): boolean;
  parse(body: unknown): NormalizedEmailEvent[];
}

export function headerValue(
  headers: EmailWebhookRequest['headers'],
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
