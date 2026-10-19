import {
  isIpAllowed,
  extractClientIp,
  parseTrustedProxyList,
} from './ip-utils';

describe('isIpAllowed', () => {
  it('returns true when allowedIps is empty (no restriction)', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true);
  });

  it('returns true for an exact IPv4 match', () => {
    expect(isIpAllowed('1.2.3.4', ['1.2.3.4'])).toBe(true);
  });

  it('returns false when IPv4 is not in the list', () => {
    expect(isIpAllowed('1.2.3.5', ['1.2.3.4'])).toBe(false);
  });

  it('matches an IP inside an IPv4 CIDR range', () => {
    expect(isIpAllowed('10.0.0.5', ['10.0.0.0/8'])).toBe(true);
  });

  it('rejects an IP outside an IPv4 CIDR range', () => {
    expect(isIpAllowed('11.0.0.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('matches the network address of a /24 CIDR', () => {
    expect(isIpAllowed('192.168.1.0', ['192.168.1.0/24'])).toBe(true);
  });

  it('matches the broadcast address of a /24 CIDR', () => {
    expect(isIpAllowed('192.168.1.255', ['192.168.1.0/24'])).toBe(true);
  });

  it('rejects an IP just outside a /24 CIDR', () => {
    expect(isIpAllowed('192.168.2.1', ['192.168.1.0/24'])).toBe(false);
  });

  it('matches when one of multiple entries covers the IP', () => {
    expect(isIpAllowed('172.16.0.1', ['10.0.0.0/8', '172.16.0.0/12'])).toBe(
      true,
    );
  });

  it('handles a /32 CIDR as an exact match', () => {
    expect(isIpAllowed('5.6.7.8', ['5.6.7.8/32'])).toBe(true);
    expect(isIpAllowed('5.6.7.9', ['5.6.7.8/32'])).toBe(false);
  });

  it('matches exact IPv6 address (case-insensitive)', () => {
    expect(isIpAllowed('2001:DB8::1', ['2001:db8::1'])).toBe(true);
  });

  it('matches an IPv4-mapped IPv6 address against an IPv4 allowlist', () => {
    expect(isIpAllowed('::ffff:1.2.3.4', ['1.2.3.4'])).toBe(true);
  });
});

describe('parseTrustedProxyList', () => {
  it('returns an empty list when unset', () => {
    expect(parseTrustedProxyList(undefined)).toEqual([]);
    expect(parseTrustedProxyList('')).toEqual([]);
  });

  it('parses comma-separated entries and trims whitespace', () => {
    expect(
      parseTrustedProxyList('10.0.0.0/8, 192.168.1.10 , ,203.0.113.5'),
    ).toEqual(['10.0.0.0/8', '192.168.1.10', '203.0.113.5']);
  });
});

describe('extractClientIp', () => {
  it('does not trust X-Forwarded-For from an untrusted peer (spoofed header ignored)', () => {
    const req = {
      socket: { remoteAddress: '198.51.100.7' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    };
    expect(extractClientIp(req)).toBe('198.51.100.7');
  });

  it('does not trust X-Forwarded-For when no trusted proxies are configured', () => {
    const req = {
      socket: { remoteAddress: '198.51.100.7' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    };
    expect(extractClientIp(req, [])).toBe('198.51.100.7');
  });

  it('falls back to the socket peer address when no X-Forwarded-For is present', () => {
    const req = { socket: { remoteAddress: '9.8.7.6' }, headers: {} };
    expect(extractClientIp(req)).toBe('9.8.7.6');
  });

  it('falls back to connection.remoteAddress when socket is absent', () => {
    const req = { headers: {}, connection: { remoteAddress: '4.3.2.1' } };
    expect(extractClientIp(req)).toBe('4.3.2.1');
  });

  it('resolves the client from X-Forwarded-For when the peer is a trusted proxy', () => {
    const req = {
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.5' },
    };
    expect(extractClientIp(req, ['10.0.0.0/8'])).toBe('1.2.3.4');
  });

  it('ignores a forged leading X-Forwarded-For entry inserted behind a trusted proxy', () => {
    const req = {
      socket: { remoteAddress: '10.0.0.5' },
      // Forged leftmost entry; attacker real IP is right of the trusted proxy
      headers: { 'x-forwarded-for': '203.0.113.10, 198.51.100.7, 10.0.0.5' },
    };
    expect(extractClientIp(req, ['10.0.0.0/8'])).toBe('198.51.100.7');
  });

  it('handles X-Forwarded-For provided as an array', () => {
    const req = {
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': ['3.3.3.3, 10.0.0.5'] },
    };
    expect(extractClientIp(req, ['10.0.0.5'])).toBe('3.3.3.3');
  });

  it('falls back to the peer when every X-Forwarded-For hop is a trusted proxy', () => {
    const req = {
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': '10.0.0.4, 10.0.0.5' },
    };
    expect(extractClientIp(req, ['10.0.0.0/8'])).toBe('10.0.0.5');
  });

  it('normalises an IPv4-mapped IPv6 peer address', () => {
    const req = {
      socket: { remoteAddress: '::ffff:198.51.100.7' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    };
    expect(extractClientIp(req)).toBe('198.51.100.7');
  });

  it('returns undefined when no peer address is available', () => {
    expect(extractClientIp({ headers: {} })).toBeUndefined();
  });
});
