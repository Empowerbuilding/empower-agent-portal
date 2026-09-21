import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMemberBySlug } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Same-origin PostgREST proxy for org CRM Supabase projects.
 *
 * Why: CRM keys are new-style `sb_secret_` keys (post 2026-09-20 rotation).
 * Supabase rejects secret keys on browser requests, so client components
 * can no longer talk to the CRM project directly. They point supabase-js
 * at /api/crm-proxy/<orgSlug> instead; this route verifies the portal
 * session + org membership, then forwards the request with the org's CRM
 * key attached server-side. The key never reaches the browser.
 */

const ALLOWED_PREFIXES = ['rest/v1/', 'storage/v1/'];

// Request headers we pass through to PostgREST.
const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'prefer',
  'accept-profile',
  'content-profile',
  'range',
  'range-unit',
  'x-supabase-api-version',
];

// Response headers supabase-js relies on (counts, ranges, prefs).
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'range-unit',
  'preference-applied',
  'content-profile',
];

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; path: string[] }> }
) {
  const { orgSlug, path } = await params;

  const auth = await requireOrgMemberBySlug(orgSlug);
  if (!auth.ok) return auth.response;

  const subPath = (path ?? []).join('/');
  if (!ALLOWED_PREFIXES.some((p) => subPath.startsWith(p))) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('crm_supabase_url, crm_supabase_key')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (!org?.crm_supabase_url || !org?.crm_supabase_key) {
    return NextResponse.json({ error: 'CRM not configured for org' }, { status: 404 });
  }

  const target = `${org.crm_supabase_url.replace(/\/$/, '')}/${subPath}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('apikey', org.crm_supabase_key);
  headers.set('authorization', `Bearer ${org.crm_supabase_key}`);

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error('[crm-proxy] upstream fetch failed:', err);
    return NextResponse.json({ error: 'CRM upstream unreachable' }, { status: 502 });
  }

  const respHeaders = new Headers();
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }

  if (req.method === 'HEAD') {
    return new NextResponse(null, { status: upstream.status, headers: respHeaders });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, { status: upstream.status, headers: respHeaders });
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
  handle as HEAD,
};
