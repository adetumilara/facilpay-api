# Payouts, settlement preview and balance history

All routes require merchant JWT authentication.

## Cancel a payout

`POST /v1/payouts/:id/cancel` requires `payouts:create`. Returns the payout with status `CANCELLED`. Only pending payouts can be cancelled; submitted, completed and failed payouts return 409. Repeating cancellation is safe. Cancelled payouts no longer consume available balance or daily payout limits. A running queue job skips a payout whose cancellation won the database race.

## Bulk payout upload

`POST /v1/payouts/bulk` requires `payouts:create` and `X-Step-Up-Token`. Submit multipart form data with the CSV in the `file` field (maximum 1 MiB and 1,000 data rows).

Required headers: `destination,amount,currency,reference`. Optional header: `memo`. Quoted commas, escaped quotes, CRLF and embedded newlines are supported. References must be unique within the upload and across the merchant's existing payouts. All rows, destinations, combined per-currency balances and remaining daily limits are validated before the transaction saves any payouts or jobs are queued.

The response contains `batchId` and `rows`, each with CSV record number `row` (header is record 1), `payoutId`, `reference` and initial `status`. Payout records retain their batch ID; use the existing payout list/detail routes for subsequent statuses.

## Settlement preview

`GET /v1/settlements/preview` returns `previews`, one per configured currency, with `nextSettlementAt`, schedule, payment count, gross amount, fees, pending refunds, booked refunds (`completedRefunds`), total amount, reserve and net amount. Schedule boundaries are UTC: daily midnight, Sunday midnight, or the first day of the month. The snapshot uses the same calculation as the actual settlement run; data changes before that run can change the estimate. Pending transfers already booked against a payment are deducted once; pending approval refunds add a holdback.

## Daily balance history

`GET /v1/merchants/me/balance/history?from=2026-10-01&to=2026-10-19` accepts inclusive calendar dates spanning at most 366 days. Returns `merchantId`, the merchant settings `timezone` (UTC fallback), and `days`: flat records containing `date`, `currency` and decimal-string `balance` for the AVAILABLE ledger account. Closing balances include all prior entries, carry across empty days, and exclude entries exactly at the following local midnight. Local calendar boundaries handle daylight-saving changes. Results are cached for up to 60 seconds.

## Database and tests

Apply migration `1792368000000-AddPayoutCancellationAndBatch` before serving cancellation or bulk uploads. Its rollback removes the batch column and retains the cancellation enum value for existing records.

Focused specs cover CSV validation, cancellation, batch limits, preview/run agreement and history validation/cache isolation. The PostgreSQL history spec additionally checks spring and autumn daylight-saving boundaries using a temporary table; set `TEST_DATABASE_URL` to a test PostgreSQL database to enable it. No dependency commands, builds, tests or migrations were executed during this file-only change.
