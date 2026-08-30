import crypto from 'crypto';

/**
 * Verify a Resend (svix) webhook signature without the svix dependency.
 * Scheme: HMAC-SHA256 over `${svixId}.${svixTimestamp}.${rawBody}` keyed with
 * the base64 portion of the `whsec_...` secret. Header `svix-signature` holds
 * space-separated `v1,<base64sig>` entries.
 */
export function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignature: string,
  toleranceSec = 300
): boolean {
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;
  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');

  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Extract the domain from an address like `Name <user@dom.com>` or `user@dom.com`. */
export function senderDomain(from: string | undefined | null): string | null {
  if (!from) return null;
  const m = from.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})>?\s*$/);
  return m ? m[1].toLowerCase() : null;
}
