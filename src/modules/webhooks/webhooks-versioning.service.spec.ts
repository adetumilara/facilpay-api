import '../payload-serializers/index';
import { getSerializer, CURRENT_API_VERSION } from '../payload-serializers/registry';

describe('Webhook payload versioning', () => {
  const event = 'payment.completed';
  const data = { id: 'pay-1', amount: 100, currency: 'USD', status: 'COMPLETED' };
  const eventId = 'evt-1';

  describe('v1 serializer (2026-09-01)', () => {
    const serializer = getSerializer('2026-09-01');

    it('produces the legacy flat format', () => {
      const payload = serializer.serialize(event, data, eventId);
      expect(payload.event).toBe(event);
      expect(payload.data).toBe(data);
      expect(payload.eventId).toBe(eventId);
      expect(payload.timestamp).toBeDefined();
      expect(payload.version).toBeUndefined();
    });

    it('omits eventId key when not provided', () => {
      const payload = serializer.serialize(event, data);
      expect('eventId' in payload).toBe(false);
    });
  });

  describe('v2 serializer (2026-10-01)', () => {
    const serializer = getSerializer('2026-10-01');

    it('produces the versioned format with meta block', () => {
      const payload = serializer.serialize(event, data, eventId);
      expect(payload.version).toBe('2026-10-01');
      expect(payload.event).toBe(event);
      expect(payload.data).toBe(data);
      expect(payload.eventId).toBe(eventId);
      expect(payload.meta).toBeDefined();
      expect(payload.meta.apiVersion).toBe('2026-10-01');
    });
  });

  describe('version isolation', () => {
    it('v1 and v2 payloads differ structurally', () => {
      const v1 = getSerializer('2026-09-01').serialize(event, data, eventId);
      const v2 = getSerializer('2026-10-01').serialize(event, data, eventId);
      expect(v1.version).toBeUndefined();
      expect(v2.version).toBe('2026-10-01');
      expect(v1.meta).toBeUndefined();
      expect(v2.meta).toBeDefined();
    });

    it('fallback to current version for unknown version string', () => {
      const s = getSerializer('9999-99-99');
      const payload = s.serialize(event, data);
      expect(payload.event).toBe(event);
    });
  });

  describe('CURRENT_API_VERSION', () => {
    it('is the v1 format', () => {
      expect(CURRENT_API_VERSION).toBe('2026-09-01');
    });
  });
});
