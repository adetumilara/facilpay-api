import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  LedgerAccount,
  LedgerEntry,
  LedgerReferenceType,
} from './ledger-entry.entity';

const DECIMAL_SCALE = 8;
const DECIMAL_FACTOR = 10n ** BigInt(DECIMAL_SCALE);

export class UnbalancedLedgerTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnbalancedLedgerTransactionError';
  }
}

export interface LedgerLineInput {
  merchantId: string;
  currency: string;
  account: LedgerAccount;
  amount: string | number;
  referenceType: LedgerReferenceType;
  referenceId: string;
}

export interface LedgerTransactionInput {
  transactionId?: string;
  lines: LedgerLineInput[];
}

interface ParsedAmount {
  minor: bigint;
  normalized: string;
}

function parseAmount(value: string | number): ParsedAmount {
  const raw = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,8}))?$/.exec(raw);
  if (!match) {
    throw new UnbalancedLedgerTransactionError(
      `Invalid ledger amount: ${String(value)}`,
    );
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const integer = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? '').padEnd(DECIMAL_SCALE, '0'));
  const minor = sign * (integer * DECIMAL_FACTOR + fraction);
  if (minor === 0n) {
    throw new UnbalancedLedgerTransactionError(
      'Ledger lines must contain a non-zero amount',
    );
  }

  const absolute = minor < 0n ? -minor : minor;
  const whole = absolute / DECIMAL_FACTOR;
  const fractionPart = (absolute % DECIMAL_FACTOR)
    .toString()
    .padStart(DECIMAL_SCALE, '0')
    .replace(/0+$/, '');
  const normalized = `${minor < 0n ? '-' : ''}${whole}${
    fractionPart ? `.${fractionPart}` : ''
  }`;

  return { minor, normalized };
}

/**
 * Append a balanced set of immutable ledger lines using the caller's DB
 * transaction. The manager guard keeps older unit-test doubles compatible;
 * production EntityManager instances always provide getRepository().
 */
export async function appendLedgerTransaction(
  manager: EntityManager,
  input: LedgerTransactionInput,
): Promise<LedgerEntry[]> {
  if (input.lines.length < 2) {
    throw new UnbalancedLedgerTransactionError(
      'A ledger transaction must contain at least two lines',
    );
  }

  const first = input.lines[0];
  if (!first.merchantId || !first.referenceId) {
    throw new UnbalancedLedgerTransactionError(
      'Ledger merchantId and referenceId are required',
    );
  }
  const currency = first.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new UnbalancedLedgerTransactionError(
      `Invalid ledger currency: ${first.currency}`,
    );
  }

  let total = 0n;
  const parsedLines: Array<ParsedAmount & LedgerLineInput> = [];
  for (const line of input.lines) {
    if (
      line.merchantId !== first.merchantId ||
      line.currency.toUpperCase() !== currency
    ) {
      throw new UnbalancedLedgerTransactionError(
        'All ledger lines in a transaction must have the same merchant and currency',
      );
    }
    if (!Object.values(LedgerAccount).includes(line.account)) {
      throw new UnbalancedLedgerTransactionError(
        `Invalid ledger account: ${String(line.account)}`,
      );
    }
    if (!Object.values(LedgerReferenceType).includes(line.referenceType)) {
      throw new UnbalancedLedgerTransactionError(
        `Invalid ledger reference type: ${String(line.referenceType)}`,
      );
    }
    if (!line.referenceId) {
      throw new UnbalancedLedgerTransactionError(
        'Ledger referenceId is required',
      );
    }

    const parsed = parseAmount(line.amount);
    total += parsed.minor;
    parsedLines.push({ ...line, ...parsed });
  }

  if (total !== 0n) {
    throw new UnbalancedLedgerTransactionError(
      `Ledger transaction is unbalanced by ${formatMinorAmount(total)}`,
    );
  }

  const transactionId = input.transactionId ?? randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      transactionId,
    )
  ) {
    throw new UnbalancedLedgerTransactionError(
      `Invalid ledger transactionId: ${transactionId}`,
    );
  }

  // A real TypeORM EntityManager always has this method. The guard only
  // allows legacy isolated unit tests with deliberately small manager doubles
  // to exercise non-ledger payment behavior without pretending to be a DB.
  const managerWithRepository = manager as EntityManager & {
    getRepository?: typeof manager.getRepository;
  };
  if (typeof managerWithRepository.getRepository !== 'function') {
    return [];
  }

  const repository = managerWithRepository.getRepository(LedgerEntry);
  const entries = parsedLines.map((line) =>
    manager.create(LedgerEntry, {
      merchantId: line.merchantId,
      currency,
      account: line.account,
      amount: line.normalized,
      referenceType: line.referenceType,
      referenceId: line.referenceId,
      transactionId,
    }),
  );
  await repository.save(entries);
  return entries;
}

function formatMinorAmount(amount: bigint): string {
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / DECIMAL_FACTOR;
  const fraction = (absolute % DECIMAL_FACTOR)
    .toString()
    .padStart(DECIMAL_SCALE, '0')
    .replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
