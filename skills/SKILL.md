---
name: tiered-rate-limiter
description: Per-tier API rate limiting with Redis or in-memory fallback
version: 0.1.0
---

# Tiered Rate Limiter Skill

Use this skill when the user needs to add rate limiting to an Express/Node.js API with different limits per subscription tier.

## When to use
- User is building an API and needs rate limiting
- User wants different rate limits for free/pro/enterprise tiers
- User mentions Redis-backed rate limiting with in-memory fallback

## How to use

```typescript
import { createRateLimiter } from 'tiered-rate-limiter';

const limiter = createRateLimiter({
  tiers: {
    free: { windowMs: 60000, max: 10 },
    pro: { windowMs: 60000, max: 100 },
    enterprise: { windowMs: 60000, max: 1000 }
  },
  redis: { url: process.env.REDIS_URL }, // optional, falls back to in-memory
  keyGenerator: (req) => req.user?.id || req.ip,
  tierResolver: (req) => req.user?.tier || 'free'
});

app.use('/api', limiter);
```

## Key behaviors
- Express middleware compatible
- Automatic Redis/in-memory fallback (graceful degradation)
- Per-tier configuration with custom window sizes and limits
- Custom key generation (user ID, IP, API key, etc.)
- Returns standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
