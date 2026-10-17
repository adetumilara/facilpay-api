# Payment Links

## Overview

Payment links are shareable, merchant-created checkout URLs identified by a unique token. Each link tracks how many times it has been viewed (`views`) and how many times it has led to a completed payment (`completions`). Links can be updated, paginated/sorted, and deactivated (soft-deleted) without losing their history.

## Endpoints

### `POST /v1/payment-links`

Creates a new payment link for the authenticated merchant. Requires a valid Bearer token.

Request body:

```json
{
  "amount": 50.0,
  "currency": "USD",
  "description": "Invoice #42",
  "expiresAt": "2026-12-31T23:59:59Z",
  "maxCompletions": 1,
  "successUrl": "https://merchant.example.com/paid?payment_id={PAYMENT_ID}",
  "cancelUrl": "https://merchant.example.com/cancelled"
}
```

- `amount` and `currency` are required.
- `description`, `expiresAt`, and `maxCompletions` are optional. Set `maxCompletions` to `1` for a single-use link; the link deactivates after that many successful payments.
- `successUrl` and `cancelUrl` are optional HTTPS URLs (maximum 2048 characters). Local/private IP destinations and URL credentials are rejected.
- Use `{PAYMENT_ID}` in `successUrl` where the completed payment ID should be inserted. The payment response returns the URL with the placeholder replaced.
- A unique 32-character hex `token` is generated server-side and returned in the response; it forms the public URL segment (e.g. `/v1/payment-links/:token`).

Response: the created `PaymentLink`, including `token`, `views: 0`, `completions: 0`, and `isActive: true`.

### `POST /v1/payment-links/:id/duplicate`

Creates a new payment link from a link owned by the authenticated merchant. The request body is optional; any supplied create-time configuration fields override the copied values. The duplicate receives a fresh token, no slug by default, zero views and completions, and starts active. A `slug` can be supplied in the body to assign a new custom slug.

Returns `403 Forbidden` if the source link belongs to another merchant, or `404 Not Found` if it does not exist.

### `GET /v1/payment-links`

Returns a paginated list of payment links belonging to the authenticated merchant. Requires a valid Bearer token.

Query parameters:

| Parameter | Description                                                              |
| --------- | ------------------------------------------------------------------------- |
| `page`    | Page number (default `1`)                                                 |
| `limit`   | Items per page, max 100 (default `20`)                                    |
| `sortBy`  | One of `createdAt`, `amount`, `views`, `completions`, `updatedAt` (default `createdAt`) |
| `order`   | `ASC` or `DESC` (default `DESC`)                                          |

Any `sortBy` value outside the allowed list falls back to `createdAt`.

Response:

```json
{
  "data": [ /* PaymentLink[] */ ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

### `GET /v1/payment-links/:token`

**Public endpoint — no authentication required.** Used by the checkout page to resolve a shareable link.

- Increments the link's `views` counter by 1 on every call, including repeat visits.
- Returns `404 Not Found` if the token doesn't match any link.
- Returns `410 Gone` if the link has been deactivated (`isActive: false`), has passed its `expiresAt`, or has reached its `maxCompletions`.
- Includes configured `successUrl` and `cancelUrl` values in the public link response.
- Redeem with `couponCode` to receive a `couponPreview` containing the discount and final amount. Include the same code and `paymentLinkId` in payment creation; the API recalculates the discount and reserves limited redemptions transactionally.

### `PATCH /v1/payment-links/:id`

Updates an existing payment link. Requires a valid Bearer token, and the link must belong to the authenticated merchant (`403 Forbidden` otherwise).

Editable fields (all optional — only the fields present in the body are changed):

- `amount`
- `currency`
- `description`
- `expiresAt`
- `successUrl`
- `cancelUrl`

Returns `404 Not Found` if the link doesn't exist.

### `DELETE /v1/payment-links/:id`

Deactivates a payment link. Requires a valid Bearer token, and the link must belong to the authenticated merchant (`403 Forbidden` otherwise).

This sets `isActive: false` rather than deleting the row — the link's history (`views`, `completions`) is preserved, and any subsequent `GET /v1/payment-links/:token` request against it will return `410 Gone`.

Returns `204 No Content` on success, `404 Not Found` if the link doesn't exist.
