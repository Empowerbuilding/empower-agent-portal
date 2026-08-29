import { NextResponse } from 'next/server';

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Scope: best-effort abuse throttle for expensive routes (AI/SMS/lookup).
 * This is per-instance memory — it resets on deploy and does not coordinate
 * across multiple app instances. It is NOT a security boundary (auth is);
 * it only blunts a single client hammering a route. For hard guarantees,
 * move to a shared store (Upstash/Redis) later.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export interface RateLimitOptions {
  /** Unique route key, e.g. "sms:send". */
  key: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

/**
 * Returns null if allowed, or a 429 NextResponse if the caller is over budget.
 * Identify callers by a stable id (auth user id preferred; fall back to IP).
 */
export function checkRateLimit(identifier: string, opts: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const k = `${opts.key}:${identifier}`;
  const b = buckets.get(k);
  if (!b || b.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }
  if (b.count >= opts.limit) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded. Slow down and try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  b.count += 1;
  return null;
}

/** Best-effort client IP from proxy headers (Coolify/Next). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
