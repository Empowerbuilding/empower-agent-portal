import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { provisionOrg, type ProvisionInput } from '@/scripts/provision-org';

export const runtime = 'nodejs';
export const maxDuration = 120; // provisioning can take up to 2 min

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const {
    orgName, orgSlug, agentDisplayName, agentTone,
    industry, whatWeSell, website, reps, enabledCrons,
    companyKnowledge, businessHours,
  } = body;

  // Validate required fields
  if (!orgName || !orgSlug || !reps?.length) {
    return NextResponse.json({ error: 'Missing required fields: orgName, orgSlug, reps' }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(orgSlug)) {
    return NextResponse.json({ error: 'orgSlug must be lowercase letters, numbers, and hyphens only' }, { status: 400 });
  }

  // Check slug not already taken
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();
  if (existing) {
    return NextResponse.json({ error: `Slug "${orgSlug}" is already taken` }, { status: 409 });
  }

  // Get user's name from portal_users (may not exist yet for new signup)
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('name, email')
    .eq('supabase_auth_id', user.id)
    .maybeSingle();

  const input: ProvisionInput = {
    orgName,
    orgSlug,
    ownerEmail: portalUser?.email ?? user.email ?? '',
    ownerName: portalUser?.name ?? user.email?.split('@')[0] ?? 'Owner',
    ownerSupabaseAuthId: user.id,
    agentDisplayName: agentDisplayName || 'Vanessa',
    agentTone: agentTone || 'Professional',
    industry: industry || 'Home Building',
    whatWeSell: whatWeSell || '',
    website: website || '',
    companyKnowledge: companyKnowledge || '',
    businessHours: businessHours || '',
    reps,
    enabledCrons,
    wizard: body.wizard,
  };

  const result = await provisionOrg(input);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orgId: result.orgId,
    orgSlug: result.orgSlug,
    agentId: result.agentId,
    redirectTo: `/${result.orgSlug}/general`,
  });
}
