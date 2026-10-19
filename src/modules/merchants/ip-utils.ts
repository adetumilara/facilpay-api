import * as net from 'net';

/**
 * Converts an IPv4 address string to a 32-bit integer.
 */
function ipv4ToInt(ip: string): number {
  return (
    ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
  );
}

/**
 * Converts an IPv6 address string to a 128-bit BigInt.
 * Handles :: compression and zone identifiers.
 */
function ipv6ToBigInt(ip: string): bigint {
  // Strip zone identifier (e.g. fe80::1%lo0)
  const withoutZone = ip.split('%')[0].toLowerCase();
  let parts: string[];

  if (withoutZone.includes('::')) {
    const [head, tail] = withoutZone.split('::');
    const headParts = head ? head.split(':').filter(Boolean) : [];
    const tailParts = tail ? tail.split(':').filter(Boolean) : [];
    const missing = 8 - headParts.length - tailParts.length;
    parts = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    parts = withoutZone.split(':');
  }

  // Pad to 8 groups; handle edge cases like "::"
  while (parts.length < 8) {
    parts.push('0');
  }

  let result = 0n;
  for (const part of parts) {
    const value = part === '' ? 0 : parseInt(part || '0', 16);
    result = (result << 16n) | BigInt(value);
  }
  return result;
}

/**
 * Checks whether `ip` is contained in the CIDR block `cidr`.
 * Supports both IPv4 and IPv6 CIDR (e.g. "10.0.0.0/8", "2001:db8::/32")
 * and exact matches for either family.
 */
function matchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    // Exact match (normalise IPv6 casing)
    return ip === cidr || ip.toLowerCase() === cidr.toLowerCase();
  }

  const [range, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (Number.isNaN(prefix)) {
    return false;
  }

  if (net.isIPv4(ip) && net.isIPv4(range)) {
    if (prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
  }

  if (net.isIPv6(ip) && net.isIPv6(range)) {
    if (prefix < 0 || prefix > 128) return false;
    if (prefix === 0) return true;
    if (prefix === 128) {
      return ipv6ToBigInt(ip) === ipv6ToBigInt(range);
    }
    const shift = 128n - BigInt(prefix);
    return (ipv6ToBigInt(ip) >> shift) === (ipv6ToBigInt(range) >> shift);
  }

  // Mismatched families or invalid – never matches CIDR
  return false;
}

/**
 * Normalises an IP string for comparison, e.g. strips the IPv4-mapped
 * IPv6 prefix (`::ffff:1.2.3.4` -> `1.2.3.4`).
 */
function normalizeIp(ip: string): string {
  return ip.toLowerCase().replace(/^::ffff:/, '');
}

/**
 * Returns true when `ip` matches one of the trusted proxy entries
 * (exact IP match or CIDR block).
 */
function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
  return trustedProxies.some((entry) => matchesCidr(normalizeIp(ip), entry));
}

/**
 * Parses a comma-separated `TRUSTED_PROXY_IPS` value into a list of
 * IP addresses / CIDR blocks. Returns an empty list when unset.
 */
export function parseTrustedProxyList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Extracts the real client IP from an Express request.
 *
 * The client-supplied `X-Forwarded-For` header is only honoured when the
 * immediate connecting peer (`req.socket.remoteAddress`) is a configured
 * trusted proxy; otherwise the header is attacker-controlled and the socket
 * peer address is used. When a trusted proxy is present, the rightmost
 * `X-Forwarded-For` entry that is not itself a trusted proxy is the client —
 * this defeats forged leading entries inserted by a client behind the proxy.
 */
export function extractClientIp(
  req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    connection?: { remoteAddress?: string };
    socket?: { remoteAddress?: string };
  },
  trustedProxies: string[] = [],
): string | undefined {
  const peer = normalizeIp(
    req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? req.ip ?? '',
  );
  if (!peer) return undefined;

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && isTrustedProxy(peer, trustedProxies)) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const entries = raw
      .split(',')
      .map((entry) => normalizeIp(entry.trim()))
      .filter(Boolean);

    // Walk from the right, skipping trusted proxies, to find the client IP.
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!isTrustedProxy(entries[i], trustedProxies)) {
        return entries[i];
      }
    }

    // Every hop in the chain is a trusted proxy — fall back to the peer.
    return peer;
  }

  return peer;
}

/**
 * Returns true when `ip` is allowed by `allowedIps`.
 * An empty allowlist means no restriction (all IPs pass).
 */
export function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  return allowedIps.some((entry) => matchesCidr(normalizeIp(ip), entry));
}

// Export for testing
export { matchesCidr, ipv4ToInt, ipv6ToBigInt };
