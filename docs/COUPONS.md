# Coupons

Coupons are merchant-owned and case-insensitive. Codes are stored normalized to uppercase and unique per merchant.

## Endpoints

- `POST /v1/coupons` creates a coupon.
- `GET /v1/coupons` and `GET /v1/coupons/:id` list or retrieve coupons.
- `PATCH /v1/coupons/:id` updates a coupon.
- `DELETE /v1/coupons/:id` deactivates it.

Coupon types are `PERCENT` and `FIXED`. Fixed coupons require a currency. `maxRedemptions`, `expiresAt`, `isActive`, and `applicableLinkIds` are optional.

At payment-link redemption, send `couponCode` to preview the discount. Include the code and the payment link ID when creating the payment. The API calculates the discount from the stored link amount, clamps it so the charge cannot be negative, and stores `couponId` and `discountAmount` on the payment. Redemption capacity is reserved under a database row lock during payment creation, counted when the payment completes, and released on failure, cancellation, or expiry.