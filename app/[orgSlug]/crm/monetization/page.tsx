export const dynamic = 'force-dynamic';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import MonetizationClient from './MonetizationClient';

// Consumer capture sources only — matches CRM /api/monetization
const CONSUMER_SOURCES = [
  'facebook_lead_ad', 'cost_calc', 'floor_plan_archive', 'shopify_cost_calc',
  'calendar_booking', 'barnhaus_contact', 'empower_facebook_lead_ad', 'guide_download',
  'shopify_order', 'barnhaus_store_contact', 'style_swap', 'shopify_store_modification',
  'direct_phone_call', 'referral', 'design_concierge', 'tradeshow', 'trade_show',
  'email_inbound', 'inbound_email', 'email', 'hallie_uncaptured_call', 'hallie_store_call',
  'empower_website',
];

const CAPTURE_LAUNCH = '2026-10-08T00:00:00Z';

export default async function MonetizationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('slug, id, crm_supabase_url, crm_supabase_key, monetization_enabled').eq('slug', orgSlug).single();
  if (!org?.monetization_enabled || !org?.crm_supabase_url || !org?.crm_supabase_key) {
    return notFound();
  }

  // Referral economics = owner/admin only (reps + contractors don't see buyer terms)
  const { data: portalUser } = await supabase.from('portal_users').select('role').eq('supabase_auth_id', user.id).eq('org_id', org.id).maybeSingle();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) {
    return (
      <div style={{ padding: 48, color: 'var(--muted)', textAlign: 'center' }}>
        Monetization is restricted to org owners and admins.
      </div>
    );
  }

  const crm = createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);

  const [totalConsumer, sinceLaunch, routingAnswered, kitCount, lenderCount, realtorCount, builderCount, smsCount] = await Promise.all([
    crm.from('contacts').select('id', { count: 'exact', head: true }).in('lead_source', CONSUMER_SOURCES),
    crm.from('contacts').select('id', { count: 'exact', head: true }).in('lead_source', CONSUMER_SOURCES).gte('created_at', CAPTURE_LAUNCH),
    crm.from('contacts').select('id', { count: 'exact', head: true }).in('lead_source', CONSUMER_SOURCES).gte('created_at', CAPTURE_LAUNCH).not('project_type', 'is', null),
    crm.from('contacts').select('id', { count: 'exact', head: true }).eq('consent_kit', true),
    crm.from('contacts').select('id', { count: 'exact', head: true }).eq('consent_lender', true),
    crm.from('contacts').select('id', { count: 'exact', head: true }).eq('consent_realtor', true),
    crm.from('contacts').select('id', { count: 'exact', head: true }).eq('consent_builder', true),
    crm.from('contacts').select('id', { count: 'exact', head: true }).eq('consent_sms', true),
  ]);

  const { data: eligibleRaw } = await crm
    .from('contacts')
    .select('id, first_name, last_name, phone, email, lead_source, project_type, budget_range, land_status, financing_status, timeline, trestle_city, trestle_state, consent_kit, consent_lender, consent_realtor, consent_builder, consent_sms, created_at')
    .or('consent_kit.eq.true,consent_lender.eq.true,consent_realtor.eq.true,consent_builder.eq.true,consent_sms.eq.true')
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: sales } = await crm.from('lead_sales').select('*').order('sold_at', { ascending: false }).limit(200);

  const routedContactIds = new Set(
    (sales ?? []).filter((s: any) => ['pending', 'delivered', 'closed', 'paid'].includes(s.status)).map((s: any) => s.contact_id)
  );
  const eligibleUnsold = (eligibleRaw ?? []).filter((c: any) => !routedContactIds.has(c.id));

  const ledgerContactIds = Array.from(new Set((sales ?? []).map((s: any) => s.contact_id).filter(Boolean)));
  let contactNames: Record<string, string> = {};
  if (ledgerContactIds.length > 0) {
    const { data: ledgerContacts } = await crm.from('contacts').select('id, first_name, last_name').in('id', ledgerContactIds);
    contactNames = Object.fromEntries(
      (ledgerContacts ?? []).map((c: any) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown'])
    );
  }
  const ledger = (sales ?? []).map((s: any) => ({ ...s, contact_name: s.contact_id ? (contactNames[s.contact_id] ?? null) : null }));

  const { data: partners } = await crm
    .from('referral_partners')
    .select('id, vertical, company_name, location, service_area, contact_info, notes, cluster, status, agreement_type, fee_terms, referral_code, signed_at')
    .order('vertical')
    .order('company_name');

  const delivered = (sales ?? []).filter((s: any) => ['delivered', 'closed', 'paid'].includes(s.status)).length;
  const closed = (sales ?? []).filter((s: any) => ['closed', 'paid'].includes(s.status)).length;
  const revenue = (sales ?? []).filter((s: any) => s.status === 'paid').reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);

  return (
    <MonetizationClient
      funnel={{
        totalConsumer: totalConsumer.count ?? 0,
        sinceLaunch: sinceLaunch.count ?? 0,
        routingAnswered: routingAnswered.count ?? 0,
        consented: {
          kit: kitCount.count ?? 0,
          lender: lenderCount.count ?? 0,
          realtor: realtorCount.count ?? 0,
          builder: builderCount.count ?? 0,
          sms: smsCount.count ?? 0,
        },
        anyConsent: (eligibleRaw ?? []).length,
        delivered,
        closed,
        revenue,
      }}
      eligibleUnsold={eligibleUnsold}
      partners={partners ?? []}
      ledger={ledger}
    />
  );
}
