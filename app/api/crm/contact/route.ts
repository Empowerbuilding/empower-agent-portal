import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRM_URL = process.env.CRM_SUPABASE_URL;
// Coolify has it as CRM_SUPABASE_KEY; fall back to the longer name for local dev
const CRM_KEY = process.env.CRM_SUPABASE_KEY ?? process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;

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
  if (!CRM_URL || !CRM_KEY) {
    return NextResponse.json({ error: 'CRM not configured' }, { status: 503 });
  }

  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

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
    crm_url: `https://crm.empowerbuilding.ai/contacts/${contact.id}`,
  };

  return NextResponse.json(result);
}
