import { isIP } from 'node:net';
import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = isIP(hostname);
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.onion') ||
    (ipVersion === 0 && !hostname.includes('.'))
  ) return false;

  if (ipVersion === 4) {
    if (isPrivateIpv4(hostname)) return false;
  }
  if (ipVersion === 6) {
    const address = hostname.toLowerCase();
    if (
      address === '::' || address === '::1' || address.startsWith('fc') ||
      address.startsWith('fd') || address.startsWith('fe8') ||
      address.startsWith('fe9') || address.startsWith('fea') ||
      address.startsWith('feb') || address.startsWith('2001:db8:')
    ) return false;
    if (address.startsWith('::ffff:')) {
      const mappedAddress = address.slice('::ffff:'.length);
      let mappedIpv4 = mappedAddress;
      if (!mappedAddress.includes('.')) {
        const groups = mappedAddress.split(':');
        if (groups.length === 2) {
          const high = Number.parseInt(groups[0], 16);
          const low = Number.parseInt(groups[1], 16);
          mappedIpv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
        }
      }
      if (isPrivateIpv4(mappedIpv4)) return false;
    }
  }
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const [first, second] = address.split('.').map(Number);
  return (
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && [0, 2, 168].includes(second)) ||
    (first === 198 && [18, 19, 51].includes(second)) ||
    (first === 203 && second === 0)
  );
}

export function IsSafeHttpsUrl(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSafeHttpsUrl',
      target: (object as any).constructor,
      propertyName,
      options,
      validator: {
        validate: isSafeHttpsUrl,
        defaultMessage: () => 'URL must be a public HTTPS URL no longer than 2048 characters',
      },
    });
  };
}