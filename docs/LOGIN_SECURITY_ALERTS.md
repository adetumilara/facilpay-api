# Login Security Alerts

FacilPay emails users when a sign-in comes from a device fingerprint or country not seen in their prior sessions. Device fingerprints combine the user-agent with the stable `deviceId` sent to `POST /v1/auth/login`; the raw ID is not stored. Country detection uses the sign-in IP and GeoIP lookup.

## Device alert preference

New-device alerts are enabled by default. Authenticated users can disable device alerts with:

```http
PATCH /v1/auth/login-alerts/preference
Authorization: Bearer <access_token>
Content-Type: application/json

{"enabled": false}
```

A sign-in from a country not present in the user's session history always sends an alert, even when device alerts are disabled.

## Report an unrecognized sign-in

Each alert includes a single-use link valid for seven days. Opening it revokes all sessions and refresh tokens, requires a password reset before any new login, and sends a one-hour password-reset link to the account email. Completing the password reset clears the requirement and invalidates reset tokens and sessions.

The alert includes the sign-in time, IP address, country (when available), device label, and user-agent. No alert is sent when both the device and country have been seen before and device alerts are disabled.
