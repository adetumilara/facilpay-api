# Rates

## Endpoint

```
GET /v1/rates?from=USD&to=XLM
```

Returns the current exchange rate between two currency codes.

### Query parameters

| Parameter | Required | Description                        |
| --------- | -------- | ---------------------------------- |
| `from`    | Yes      | ISO 4217 source currency (e.g. `USD`) |
| `to`      | Yes      | ISO 4217 target currency (e.g. `XLM`) |

### Response — 200 OK

```json
{
  "from": "USD",
  "to": "XLM",
  "rate": 8.42,
  "source": "cache"
}
```

The `source` field indicates where the rate came from:

| Value      | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `cache`    | Served from Redis; rate is at most 60 seconds old (default TTL)         |
| `provider` | Cache miss — rate was fetched live from the upstream FX provider        |
| `fallback` | Provider unavailable — last known rate served from the 7-day fallback cache |

### Response — 503 Service Unavailable

Returned when neither the upstream provider nor a fallback rate is available for the requested pair.

```json
{
  "statusCode": 503,
  "message": "Unable to retrieve exchange rate for USD/XLM"
}
```

## Caching

Two Redis keys are maintained per currency pair:

- **Primary cache** (`fx:rate:<FROM>:<TO>`) — TTL 60 seconds (configurable via `FX_RATE_CACHE_TTL_SECONDS`). Populated on every successful provider fetch.
- **Fallback cache** (`fx:fallback:<FROM>:<TO>`) — TTL 7 days. Updated alongside the primary cache; survives provider outages.

## Background refresh

A cron job (`@Cron(CronExpression.EVERY_MINUTE)`) runs `refreshTrackedRates` once per minute. It proactively refreshes the primary cache only for currency pairs that have been queried at least once since the service started. Pairs that have never been requested are never fetched in the background.

If the provider is unavailable during a background refresh, the existing fallback value is preserved and no error is surfaced to callers.

## Environment variables

| Variable                   | Default                                    | Description                          |
| -------------------------- | ------------------------------------------ | ------------------------------------ |
| `FX_PROVIDER_URL`          | `https://api.exchangerate.host/latest`     | Upstream FX provider URL             |
| `FX_RATE_CACHE_TTL_SECONDS`| `60`                                       | Primary cache TTL in seconds         |
