import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMember } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { assembleSignature, type SignatureFields, EMPTY_SIGNATURE } from '@/lib/signature';

/**
 * S7 — POST /api/settings/test-email
 * body: { orgId, fields?: Partial<SignatureFields> }
 *
 * Sends a test email showing the caller's assembled signature TO THE CALLER'S
 * OWN EMAIL ONLY (address derived server-side from their portal_users row —
 * never from the request body). If `fields` is provided the unsaved editor
 * values are used; otherwise the saved portal_user_settings row.
 *
 * Send mechanism: the Tony n8n webhook — same path the invite route uses and
 * the same formatter send_email.py sends through, so what the rep receives is
 * exactly what real outbound mail will look like.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const auth = await requireOrgMember(body.orgId);
  if (!auth.ok) return auth.response;

  const limited = checkRateLimit(auth.userId, { key: 'settings:test-email', limit: 5, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const admin = createAdminClient();

  // Caller's own email — server-derived, never trusted from the request.
  const { data: me } = await admin
    .from('portal_users')
    .select('email, name')
    .eq('id', auth.portalUserId)
    .single();
  if (!me?.email) {
    return NextResponse.json({ error: 'Could not resolve your email address' }, { status: 500 });
  }

  // Signature fields: unsaved editor values if provided, else the saved row.
  let fields: SignatureFields;
  if (body.fields && typeof body.fields === 'object') {
    fields = { ...EMPTY_SIGNATURE };
    for (const key of Object.keys(EMPTY_SIGNATURE) as (keyof SignatureFields)[]) {
      const v = body.fields[key];
      if (typeof v === 'string' && v.trim()) fields[key] = v.trim();
    }
  } else {
    const { data: saved } = await admin
      .from('portal_user_settings')
      .select('*')
      .eq('user_id', auth.portalUserId)
      .eq('org_id', body.orgId)
      .maybeSingle();
    if (!saved) {
      return NextResponse.json({ error: 'No saved signature — fill in the fields first' }, { status: 400 });
    }
    fields = saved as SignatureFields;
  }

  const signature = assembleSignature(fields);
  if (!signature) {
    return NextResponse.json({ error: 'Signature is empty — set at least your name' }, { status: 400 });
  }

  const emailBody =
    `This is a test of your email signature from the Empower Agent Portal. ` +
    `Everything below the line is exactly how your signature will appear on outbound email.\n\n` +
    `—\n\n${signature}`;

  const emailRes = await fetch('https://n8n.empowerbuilding.ai/webhook/tony-send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: me.email,
      subject: 'Signature test — Empower Agent Portal',
      body: emailBody,
      from_addr: 'mitchell@empowerbuilding.ai',
    }),
  });

  const emailData = await emailRes.json().catch(() => null);
  if (!emailRes.ok || !emailData?.success) {
    console.error('Test-email send failed:', emailRes.status, emailData);
    return NextResponse.json({ error: 'Email send failed — try again shortly' }, { status: 502 });
  }

  return NextResponse.json({ success: true, sentTo: me.email });
}
