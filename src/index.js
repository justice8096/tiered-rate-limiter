/**
 * Tiered Rate Limiter — Express middleware with per-tier limits and Redis/memory fallback.
 */

/**
 * In-memory rate limit store.
 */
class MemoryStore {
  constructor() {
    this.hits = new Map();
  }

  async increment(key, windowMs) {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now - record.resetTime >= windowMs) {
      record = { count: 0, resetTime: now };
      this.hits.set(key, record);
    }

    record.count++;
    return {
      totalHits: record.count,
      resetTime: new Date(record.resetTime + windowMs)
    };
  }

  async reset(key) {
    this.hits.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now - record.resetTime > 300000) {
        this.hits.delete(key);
      }
    }
  }
}

/**
 * Build a Redis-backed store (requires ioredis-compatible client).
 */
function buildRedisStore(redisClient) {
  return {
    async increment(key, windowMs) {
      const redisKey = `ratelimit:${key}`;
      const multi = redisClient.multi();
      multi.incr(redisKey);
      multi.pttl(redisKey);
      const results = await multi.exec();

      const count = results[0][1];
      const ttl = results[1][1];

      if (ttl === -1) {
        await redisClient.pexpire(redisKey, windowMs);
      }

      return {
        totalHits: count,
        resetTime: new Date(Date.now() + (ttl > 0 ? ttl : windowMs))
      };
    },
    async reset(key) {
      await redisClient.del(`ratelimit:${key}`);
    }
  };
}

/**
 * Create rate limiter middleware.
 *
 * @param {object} config
 * @param {object} config.tiers - { tierName: { windowMs, max } }
 * @param {object} [config.redis] - Redis client instance
 * @param {function} [config.keyGenerator] - (req) => string
 * @param {function} [config.tierResolver] - (req) => string
 * @param {function} [config.onLimitReached] - (req, res, tier) => void
 * @returns {function} Express middleware
 */
export function createRateLimiter(config = {}) {
  const {
    tiers = { default: { windowMs: 60000, max: 100 } },
    redis = null,
    keyGenerator = (req) => req.ip || 'unknown',
    tierResolver = () => 'default',
    onLimitReached = null
  } = config;

  let store;
  if (redis) {
    try {
      store = buildRedisStore(redis);
    } catch (err) {
      console.warn('[rate-limiter] Redis failed, falling back to memory:', err.message);
      store = new MemoryStore();
    }
  } else {
    store = new MemoryStore();
  }

  // Periodic cleanup for memory store
  if (store instanceof MemoryStore) {
    const interval = setInterval(() => store.cleanup(), 60000);
    interval.unref?.();
  }

  return async function rateLimitMiddleware(req, res, next) {
    try {
      const tier = tierResolver(req);
      const tierConfig = tiers[tier] || tiers.default || { windowMs: 60000, max: 100 };
      const key = `${tier}:${keyGenerator(req)}`;

      const { totalHits, resetTime } = await store.increment(key, tierConfig.windowMs);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', String(tierConfig.max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, tierConfig.max - totalHits)));
      res.set('X-RateLimit-Reset', String(Math.ceil(resetTime.getTime() / 1000)));

      if (totalHits > tierConfig.max) {
        res.set('Retry-After', String(Math.ceil((resetTime.getTime() - Date.now()) / 1000)));

        if (onLimitReached) {
          onLimitReached(req, res, tier);
        }

        return res.status(429).json({
          error: 'Too Many Requests',
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
        });
      }

      next();
    } catch (err) {
      console.error('[rate-limiter] Error:', err.message);
      next(); // Fail open
    }
  };
}

export { MemoryStore, buildRedisStore };
export default createRateLimiter;
