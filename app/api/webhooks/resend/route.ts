import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySvixSignature, senderDomain } from '@/lib/resend-webhook';

// S25 — Resend delivery events → email_deliveries table.
// Signed webhook (svix). Additive: failure here never affects sending.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVENT_TIME_COL: Record<string, string> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.bounced': 'bounced_at',
};

// Cache org domain map for 5 min (webhook volume is low; staleness is fine).
let domainMapCache: { map: Record<string, string>; at: number } | null = null;
async function orgIdForDomain(domain: string | null): Promise<string | null> {
  if (!domain) return null;
  if (!domainMapCache || Date.now() - domainMapCache.at > 300_000) {
    const { data } = await supabase.from('organizations').select('id, email_domains');
    const map: Record<string, string> = {};
    for (const org of data ?? []) {
      for (const d of org.email_domains ?? []) map[String(d).toLowerCase()] = org.id;
    }
    domainMapCache = { map, at: Date.now() };
  }
  return domainMapCache.map[domain] ?? null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });

  const rawBody = await req.text();
  const ok = verifySvixSignature(
    secret,
    req.headers.get('svix-id') ?? '',
    req.headers.get('svix-timestamp') ?? '',
    rawBody,
    req.headers.get('svix-signature') ?? ''
  );
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const type: string = event?.type ?? '';
  const data = event?.data ?? {};
  const emailId: string | undefined = data.email_id ?? data.id;
  if (!type.startsWith('email.') || !emailId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventAt = event.created_at ?? new Date().toISOString();
  const eventEntry = { type, at: eventAt };
  const bounceMessage =
    type === 'email.bounced'
      ? (data.bounce?.message ?? data.bounce?.subType ?? null)
      : null;

  const { data: existing } = await supabase
    .from('email_deliveries')
    .select('id, events, last_event_at')
    .eq('resend_email_id', emailId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, any> = {
      last_event: type.replace('email.', ''),
      last_event_at: eventAt,
      events: [...(existing.events ?? []), eventEntry],
    };
    if (EVENT_TIME_COL[type]) patch[EVENT_TIME_COL[type]] = eventAt;
    if (bounceMessage) patch.bounce_message = String(bounceMessage).slice(0, 500);
    const { error } = await supabase.from('email_deliveries').update(patch).eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const from: string = data.from ?? '';
  const orgId = await orgIdForDomain(senderDomain(from));
  const toArr: string[] = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const row: Record<string, any> = {
    resend_email_id: emailId,
    org_id: orgId,
    from_addr: from.slice(0, 300),
    to_addrs: toArr.map((t) => String(t).slice(0, 300)),
    subject: (data.subject ?? '').slice(0, 500),
    last_event: type.replace('email.', ''),
    first_event_at: eventAt,
    last_event_at: eventAt,
    events: [eventEntry],
  };
  if (EVENT_TIME_COL[type]) row[EVENT_TIME_COL[type]] = eventAt;
  if (bounceMessage) row.bounce_message = String(bounceMessage).slice(0, 500);

  // Upsert guards against races between two events for a brand-new email.
  const { error } = await supabase
    .from('email_deliveries')
    .upsert(row, { onConflict: 'resend_email_id', ignoreDuplicates: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
