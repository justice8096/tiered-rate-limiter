import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter, MemoryStore } from '../src/index.js';

function mockReq(ip = '127.0.0.1', tier = 'free') {
  return { ip, user: { tier } };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: null,
    _json: null,
    set: (k, v) => { headers[k] = v; },
    status: (code) => { res._status = code; return res; },
    json: (body) => { res._json = body; },
    headers
  };
  return res;
}

describe('MemoryStore', () => {
  it('increments hit count', async () => {
    const store = new MemoryStore();
    const r1 = await store.increment('key1', 60000);
    expect(r1.totalHits).toBe(1);
    const r2 = await store.increment('key1', 60000);
    expect(r2.totalHits).toBe(2);
  });

  it('resets after window expires', async () => {
    const store = new MemoryStore();
    store.hits.set('key1', { count: 5, resetTime: Date.now() - 70000 });
    const result = await store.increment('key1', 60000);
    expect(result.totalHits).toBe(1);
  });

  it('resets a key', async () => {
    const store = new MemoryStore();
    await store.increment('key1', 60000);
    await store.reset('key1');
    const result = await store.increment('key1', 60000);
    expect(result.totalHits).toBe(1);
  });

  it('cleans up expired entries', async () => {
    const store = new MemoryStore();
    store.hits.set('old', { count: 1, resetTime: Date.now() - 400000 });
    store.hits.set('new', { count: 1, resetTime: Date.now() });
    store.cleanup();
    expect(store.hits.has('old')).toBe(false);
    expect(store.hits.has('new')).toBe(true);
  });
});

describe('createRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = createRateLimiter({
      tiers: { default: { windowMs: 60000, max: 10 } }
    });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.headers['X-RateLimit-Limit']).toBe('10');
    expect(res.headers['X-RateLimit-Remaining']).toBe('9');
  });

  it('blocks requests over the limit', async () => {
    const limiter = createRateLimiter({
      tiers: { default: { windowMs: 60000, max: 2 } }
    });
    const req = mockReq();
    const next = vi.fn();

    await limiter(req, mockRes(), next);
    await limiter(req, mockRes(), next);

    const res = mockRes();
    await limiter(req, res, next);
    expect(res._status).toBe(429);
    expect(res._json.error).toBe('Too Many Requests');
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('resolves tier from request', async () => {
    const limiter = createRateLimiter({
      tiers: {
        free: { windowMs: 60000, max: 1 },
        pro: { windowMs: 60000, max: 100 }
      },
      tierResolver: (req) => req.user?.tier || 'free'
    });

    const freeReq = mockReq('1.1.1.1', 'free');
    const proReq = mockReq('2.2.2.2', 'pro');
    const next = vi.fn();

    await limiter(freeReq, mockRes(), next);
    const freeRes = mockRes();
    await limiter(freeReq, freeRes, next);
    expect(freeRes._status).toBe(429);

    await limiter(proReq, mockRes(), next);
    const proRes = mockRes();
    await limiter(proReq, proRes, next);
    expect(proRes._status).toBeNull();
  });

  it('uses custom key generator', async () => {
    const limiter = createRateLimiter({
      tiers: { default: { windowMs: 60000, max: 1 } },
      keyGenerator: (req) => req.user?.tier + ':' + req.ip
    });
    const next = vi.fn();

    await limiter(mockReq('1.1.1.1'), mockRes(), next);
    await limiter(mockReq('2.2.2.2'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('calls onLimitReached callback', async () => {
    const onLimitReached = vi.fn();
    const limiter = createRateLimiter({
      tiers: { default: { windowMs: 60000, max: 1 } },
      onLimitReached
    });
    const next = vi.fn();

    await limiter(mockReq(), mockRes(), next);
    await limiter(mockReq(), mockRes(), next);
    expect(onLimitReached).toHaveBeenCalledOnce();
  });

  it('fails open on store error', async () => {
    const limiter = createRateLimiter();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    // Monkey-patch to cause error
    const origIncrement = MemoryStore.prototype.increment;
    MemoryStore.prototype.increment = () => { throw new Error('store failed'); };

    await limiter(req, res, next);
    expect(next).toHaveBeenCalled();

    MemoryStore.prototype.increment = origIncrement;
  });
});
