import { PayloadSerializer, WebhookPayload, registerSerializer } from './registry';

class V1Serializer implements PayloadSerializer {
  serialize(event: string, data: any, eventId?: string): WebhookPayload {
    return {
      event,
      timestamp: new Date().toISOString(),
      data,
      ...(eventId !== undefined && { eventId }),
    };
  }
}

const v1 = new V1Serializer();
registerSerializer('2026-09-01', v1);
export { v1 as v1Serializer };
