import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMember } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * S7 — per-user portal settings (signature fields + briefing time).
 *
 * Own-row only: the portal_users id is derived server-side from the caller's
 * auth session (requireOrgMember) — never from the request. Uses the admin
 * client so this works before AND after the portal_user_settings RLS
 * migration is applied.
 */

const SETTINGS_FIELDS = [
  'signature_name',
  'signature_title',
  'signature_company',
  'signature_address',
  'signature_phone',
  'signature_website',
  'signature_disclaimer',
  'signature_extra_html',
  'briefing_time',
] as const;

// GET /api/settings?orgId=... → the caller's own settings row (or null)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');

  const auth = await requireOrgMember(orgId);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('portal_user_settings')
    .select('*')
    .eq('user_id', auth.portalUserId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? null });
}

// PUT /api/settings  body: { orgId, ...SETTINGS_FIELDS }
// Upserts the caller's OWN row. Field allowlist — nothing else gets through.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const auth = await requireOrgMember(body.orgId);
  if (!auth.ok) return auth.response;

  const row: Record<string, string | null> = {};
  for (const key of SETTINGS_FIELDS) {
    if (key in body) {
      const v = body[key];
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
      }
      row[key] = v === null || v.trim() === '' ? null : v.trim();
    }
  }
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: 'No settings fields in body' }, { status: 400 });
  }
  // Keep signature fields sane — they get injected into outbound email HTML.
  for (const [k, v] of Object.entries(row)) {
    if (v && v.length > (k === 'signature_disclaimer' || k === 'signature_extra_html' ? 4000 : 300)) {
      return NextResponse.json({ error: `${k} too long` }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('portal_user_settings')
    .upsert(
      {
        user_id: auth.portalUserId,
        org_id: body.orgId,
        ...row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,org_id' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}
