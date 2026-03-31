# Monitoring Setup Guide

## 1. Uptime Monitoring - UptimeRobot (Free)

**What:** Checks if your site is up every 5 minutes. Alerts you if it goes down.

### Setup
1. Go to [uptimerobot.com](https://uptimerobot.com) → Create free account
2. Add New Monitor:
   - Monitor Type: HTTP(s)
   - Friendly Name: `Client - Project Name`
   - URL: `https://yourdomain.com/`
   - Monitoring Interval: 5 minutes
3. Set up alert contacts (email, Slack webhook, SMS)

### What to Monitor
| Monitor | URL | Type |
|---------|-----|------|
| Website | `https://domain.com` | HTTP(s) |
| API Health | `https://api.domain.com/` | HTTP(s) keyword: "healthy" |
| API Docs | `https://api.domain.com/docs` | HTTP(s) |

---

## 2. Error Tracking - Sentry (Free Tier: 5K errors/month)

**What:** Captures and reports application errors with full stack traces.

### Setup (Python/FastAPI)
```bash
pip install sentry-sdk[fastapi]
```

```python
# src/main.py - Add at the top
import sentry_sdk

sentry_sdk.init(
    dsn="https://your-sentry-dsn@sentry.io/project-id",
    environment="production",
    traces_sample_rate=0.1,  # 10% of requests traced
)
```

### Setup (JavaScript/React)
```bash
npm install @sentry/react
```

```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://your-sentry-dsn@sentry.io/project-id",
  environment: "production",
});
```

---

## 3. Application Health Check

Add a health check endpoint to every project:

```python
# Already in our FastAPI template (src/main.py)
@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": "1.0.0",
    }
```

### Enhanced Health Check (check DB connection)
```python
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "version": "1.0.0",
    }
```

---

## 4. Logging Best Practices

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Use in code
logger.info("User %s logged in", user.email)
logger.warning("Rate limit approaching for client %s", client_id)
logger.error("Payment failed for order %s: %s", order_id, str(error))
```

**Log levels:**
| Level | When to Use |
|-------|-------------|
| `DEBUG` | Detailed debugging info (disable in production) |
| `INFO` | Normal operations (user actions, requests) |
| `WARNING` | Something unexpected but not broken |
| `ERROR` | Something failed, needs attention |
| `CRITICAL` | System is down, immediate action needed |

---

## 5. Setup Checklist Per Client Project

- [ ] UptimeRobot monitor created (website + API)
- [ ] Sentry project created and SDK integrated
- [ ] Health check endpoint exists and works
- [ ] Logging configured (not using `print()`)
- [ ] Alert contacts configured (email at minimum)
- [ ] Database backup schedule confirmed
