/** Stellar amounts have 7 decimal places; work in integer "stroop" units. */
const SCALE = 7;
const FACTOR = 10n ** BigInt(SCALE);

export function toUnits(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const str = String(value).trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(str);
  if (!match) {
    throw new Error(`Invalid decimal amount: ${str}`);
  }
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > SCALE && /[1-9]/.test(fraction.slice(SCALE))) {
    throw new Error(`Amount has more than ${SCALE} decimal places: ${str}`);
  }
  const units =
    BigInt(whole || '0') * FACTOR + BigInt(fraction.slice(0, SCALE).padEnd(SCALE, '0'));
  return sign ? -units : units;
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / FACTOR;
  const fraction = (abs % FACTOR).toString().padStart(SCALE, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
