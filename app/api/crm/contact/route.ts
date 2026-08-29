import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser, requireOrgMemberBySlug } from '@/lib/api-auth';

const DEFAULT_CRM_URL = process.env.CRM_SUPABASE_URL;
// Coolify has it as CRM_SUPABASE_KEY; fall back to the longer name for local dev
const DEFAULT_CRM_KEY = process.env.CRM_SUPABASE_KEY ?? process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;

const PORTAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface CrmContactData {
  id: string;
  name: string;
  lifecycle_stage: string | null;
  lead_score: 'hot' | 'medium' | 'cold' | null;
  whale_score: number | null;
  whale_tier: string | null;
  best_deal: {
    title: string;
    stage: string;
    value: number | null;
  } | null;
  crm_url: string;
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  const orgSlug = req.nextUrl.searchParams.get('orgSlug');
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  // This returns contact PII + deal value by phone; was fully anon.
  // If an orgSlug is given, require membership of THAT org (stops a rep at org A
  // from querying org B's CRM). Otherwise just require any login (default CRM).
  if (orgSlug) {
    const scoped = await requireOrgMemberBySlug(orgSlug);
    if (!scoped.ok) return scoped.response;
  } else {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
  }

  let CRM_URL = DEFAULT_CRM_URL;
  let CRM_KEY = DEFAULT_CRM_KEY;

  // For non-default orgs, look up their CRM credentials from Portal Supabase
  if (orgSlug && PORTAL_URL && PORTAL_SERVICE_KEY) {
    try {
      const portal = createClient(PORTAL_URL, PORTAL_SERVICE_KEY);
      const { data: org } = await portal
        .from('organizations')
        .select('crm_supabase_url, crm_supabase_key, crm_mode')
        .eq('slug', orgSlug)
        .maybeSingle();
      if (org?.crm_supabase_url && org?.crm_supabase_key) {
        CRM_URL = org.crm_supabase_url;
        CRM_KEY = org.crm_supabase_key;
      }
    } catch (_) {}
  }

  if (!CRM_URL || !CRM_KEY) {
    return NextResponse.json({ error: 'CRM not configured' }, { status: 503 });
  }

  const crm = createClient(CRM_URL, CRM_KEY);

  // Try multiple phone formats — CRM may store them differently
  const digits = phone.replace(/\D/g, '');
  const variants = Array.from(new Set([
    phone,
    `+${digits}`,
    digits,
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : null,
    digits.length === 10 ? `+1${digits}` : null,
  ].filter(Boolean) as string[]));

  let contact: any = null;
  for (const v of variants) {
    const { data } = await crm
      .from('contacts')
      .select('id, first_name, last_name, lifecycle_stage, lead_score, whale_score, whale_tier')
      .eq('phone', v)
      .maybeSingle();
    if (data) { contact = data; break; }
  }

  if (!contact) return NextResponse.json(null);

  // Grab the best open deal (highest value, not complete/lost)
  const { data: deals } = await crm
    .from('deals')
    .select('id, title, stage, value, sales_type')
    .eq('contact_id', contact.id)
    .not('stage', 'in', '("complete","lost")')
    .order('value', { ascending: false })
    .limit(1);

  const result: CrmContactData = {
    id: contact.id,
    name: `${contact.first_name} ${contact.last_name}`.trim(),
    lifecycle_stage: contact.lifecycle_stage,
    lead_score: contact.lead_score,
    whale_score: contact.whale_score,
    whale_tier: contact.whale_tier,
    best_deal: deals?.[0]
      ? { title: deals[0].title, stage: deals[0].stage, value: deals[0].value }
      : null,
    crm_url: orgSlug
      ? `/${orgSlug}/crm/contacts/${contact.id}`
      : `https://crm.empowerbuilding.ai/contacts/${contact.id}`,
  };

  return NextResponse.json(result);
}
