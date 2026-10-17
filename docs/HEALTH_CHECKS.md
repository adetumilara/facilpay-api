# Health Checks

FacilPay exposes three health endpoints under `/v1/health`. Use the right one for each
deployment context — wiring the wrong probe causes unnecessary restarts or missed outages.

---

## Endpoints

### `GET /v1/health/live` — Liveness probe

Returns `200 OK` unconditionally. Performs **no** database queries or outbound network calls.

Use this for Kubernetes `livenessProbe` / orchestrator restart checks.  
Do **not** use it as a readiness signal — it cannot detect a degraded dependency.

**Response (200)**

```json
{
  "status": "ok",
  "statusCode": 200,
  "timestamp": "2026-01-26T10:00:00.000Z",
  "uptime": 3600
}
```

---

### `GET /v1/health/ready` — Readiness probe

Checks all critical dependencies. Returns `200` when the API is ready to serve traffic,
`503` when any critical subsystem is unreachable.

Equivalent to `GET /v1/health`.

Use this for Kubernetes `readinessProbe` and load-balancer health checks.

**Response (200 — all systems healthy)**

```json
{
  "status": "ok",
  "statusCode": 200,
  "timestamp": "2026-01-26T10:00:00.000Z",
  "uptime": 3600,
  "services": {
    "database": {
      "status": "healthy",
      "message": "Database connection is healthy"
    },
    "stellar": {
      "status": "healthy",
      "message": "Stellar network is reachable"
    },
    "horizonStream": {
      "status": "connected",
      "message": "Horizon SSE stream is active"
    },
    "queue": {
      "status": "healthy",
      "message": "Redis connection is healthy"
    },
    "system": {
      "memory": {
        "used": 536870912,
        "total": 8589934592,
        "percentUsed": 6.25
      },
      "uptime": 3600
    }
  }
}
```

**Response (503 — critical dependency down)**

```json
{
  "status": "unhealthy",
  "statusCode": 503,
  "timestamp": "2026-01-26T10:05:00.000Z",
  "uptime": 3900,
  "services": {
    "database": {
      "status": "unhealthy",
      "message": "connect ECONNREFUSED 127.0.0.1:5432"
    },
    "stellar": {
      "status": "healthy",
      "message": "Stellar network is reachable"
    },
    "horizonStream": {
      "status": "disconnected",
      "message": "Horizon SSE stream is not connected"
    },
    "queue": {
      "status": "unhealthy",
      "message": "connect ECONNREFUSED 127.0.0.1:6379"
    },
    "system": {
      "memory": {
        "used": 536870912,
        "total": 8589934592,
        "percentUsed": 6.25
      },
      "uptime": 3900
    }
  }
}
```

---

### `GET /v1/health` — Full health check (readiness)

Identical to `GET /v1/health/ready`. Returns a detailed subsystem report and additionally
includes `horizonUrls` — the multi-Horizon failover URL health list from the Stellar module.

---

## Subsystem reference

| Subsystem | Critical? | What is checked |
|-----------|-----------|-----------------|
| `database` | **Yes** | `SELECT 1` against PostgreSQL |
| `stellar` | **Yes** | HTTP `GET {STELLAR_HORIZON_URL}/health` with a 5-second timeout |
| `queue` | **Yes** | Redis `PING` via the BullMQ webhooks queue client |
| `horizonStream` | No (degraded) | In-memory flag from the SSE stream service |
| `system` | No (informational) | OS memory usage and process uptime |

**Critical** means an unhealthy status drives the HTTP response to `503`.  
**Degraded** means the overall status becomes `degraded` (still `200`) but the pod stays in rotation.

When `STELLAR_MERCHANT_ACCOUNT_ID` is unset, `horizonStream` reports `"disabled"` and does
not affect the overall status.

---

## Status codes

| `status` value | HTTP code | Meaning |
|----------------|-----------|---------|
| `ok` | 200 | All critical dependencies healthy |
| `degraded` | 200 | At least one critical dependency healthy; non-critical checks failing |
| `unhealthy` | 503 | All critical dependencies down |

---

## Kubernetes deployment examples

```yaml
# deployment.yaml
containers:
  - name: facilpay-api
    image: facilpay-api:latest
    ports:
      - containerPort: 3000

    livenessProbe:
      httpGet:
        path: /v1/health/live
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3
      # Never uses external calls — safe to use for restart decisions.

    readinessProbe:
      httpGet:
        path: /v1/health/ready
        port: 3000
      initialDelaySeconds: 15
      periodSeconds: 10
      failureThreshold: 2
      # Removes pod from Service endpoints when DB/Redis/Stellar are down.
      # Do NOT use this as a livenessProbe — a temporary dependency outage
      # would trigger pod restarts instead of graceful traffic removal.
```

---

## docker-compose healthcheck

```yaml
services:
  api:
    # … other config …
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/v1/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
```

Using the liveness endpoint here avoids false negatives when an external dependency
(e.g. Stellar Horizon) is transiently unreachable during startup.

---

## Guidance

- **Never** wire `/v1/health/ready` to `livenessProbe` — a Redis blip causes
  unnecessary restarts and potential thundering herd on reconnect.
- Use `/v1/health/ready` for readiness gates in CI/CD pipelines (`until curl -sf …; do sleep 2; done`).
- The `system.memory` block is informational only — no threshold triggers unhealthy status.
