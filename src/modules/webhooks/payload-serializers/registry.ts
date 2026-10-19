export type WebhookPayload = Record<string, any>;

export interface PayloadSerializer {
  serialize(event: string, data: any, eventId?: string): WebhookPayload;
}

export const CURRENT_API_VERSION = '2026-09-01';
export const SUPPORTED_API_VERSIONS = ['2026-09-01', '2026-10-01'] as const;
export type ApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

const serializers = new Map<string, PayloadSerializer>();

export function registerSerializer(version: string, serializer: PayloadSerializer): void {
  serializers.set(version, serializer);
}

export function getSerializer(version: string): PayloadSerializer {
  const s = serializers.get(version);
  if (!s) {
    return serializers.get(CURRENT_API_VERSION)!;
  }
  return s;
}

export function isValidApiVersion(version: string): boolean {
  return SUPPORTED_API_VERSIONS.includes(version as ApiVersion);
}
