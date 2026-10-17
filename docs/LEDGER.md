# Merchant balance ledger

The merchant ledger is an append-only double-entry record. Each row is one
signed balance delta; rows sharing a `transactionId` must sum to exactly zero
for the transaction's merchant and currency.

## Accounts

- `PENDING` — the payment funding/clearing side of a completion movement.
- `AVAILABLE` — merchant funds available for settlement.
- `FEES` — platform fee captured from a completed payment.
- `PAYOUT` — settlement clearing and refunds before settlement.
- `RESERVE` — post-settlement refund reserve.

Amounts are stored as fixed-scale decimals and are never rewritten. The
application validates each transaction before insert, and the database
migration adds an update/delete trigger to protect the append-only invariant.

## API

Both endpoints require the authenticated merchant's JWT and always scope by
that merchant ID:

- `GET /v1/merchants/me/balance?currency=USD` returns balances grouped by
  currency and account.
- `GET /v1/merchants/me/ledger?page=1&limit=20` returns paginated entries.
  Optional filters are `currency`, `account`, `referenceType`, `from`, and
  `to`.

## Movement coverage

Payment completion records the gross payment, merchant net, and fee in one
balanced transaction. Refunds debit `AVAILABLE` and credit `PAYOUT` (or
`RESERVE` after settlement). Settlements debit `AVAILABLE` and credit
`PAYOUT`. The migration backfills historical completed payments, refunds, and
settlements. A daily consistency job reports any transaction whose stored
amounts do not sum to zero.
