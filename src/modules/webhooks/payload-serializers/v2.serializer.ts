import { PayloadSerializer, WebhookPayload, registerSerializer } from './registry';

class V2Serializer implements PayloadSerializer {
  serialize(event: string, data: any, eventId?: string): WebhookPayload {
    return {
      version: '2026-10-01',
      event,
      timestamp: new Date().toISOString(),
      eventId: eventId ?? null,
      data,
      meta: {
        apiVersion: '2026-10-01',
      },
    };
  }
}

const v2 = new V2Serializer();
registerSerializer('2026-10-01', v2);
export { v2 as v2Serializer };
