import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { provisionOrg, type ProvisionInput } from '@/scripts/provision-org';
import { checkReservedSlug, validateSlugFormat } from '@/scripts/provision-guards';

export const runtime = 'nodejs';
export const maxDuration = 10; // just enough to create the job and kick off background work

const PORTAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STEP_LABELS: Record<string, string> = {
  preflight:             'Checking for name collisions',
  creating_org:          'Creating organization',
  creating_agent:        'Setting up agent profile',
  provisioning_phone:    'Acquiring phone number',
  provisioning_crm:      'Creating CRM database',
  creating_channels:     'Setting up portal channels',
  creating_users:        'Creating rep accounts',
  cloning_workspace:     'Cloning agent workspace',
  writing_files:         'Writing configuration files',
  starting_container:    'Starting agent container',
  waiting_ready:         'Waiting for agent to come online',
  seeding_crons:         'Seeding automations',
  complete:              'Agent is live',
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // S30a (risk R5): provisioning spends real money (Telnyx number, Supabase
  // project) and runs root SSH on the agent server — gate it to platform
  // admins. PROVISION_ADMIN_EMAILS = comma-separated allowlist. Unset = deny
  // (fail closed; set the env var in Coolify to enable the wizard).
  const adminList = (process.env.PROVISION_ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const userEmail = (user.email ?? '').toLowerCase();
  if (!adminList.length || !userEmail || !adminList.includes(userEmail)) {
    return NextResponse.json(
      { error: 'Provisioning is restricted to platform administrators.' },
      { status: 403 },
    );
  }

  const body = await req.json();

  const {
    orgName, orgSlug, agentDisplayName, agentTone,
    industry, whatWeSell, website, reps, enabledCrons,
    companyKnowledge, businessHours, features,
  } = body;


  if (!orgName || !orgSlug || !reps?.length) {
    return NextResponse.json({ error: 'Missing required fields: orgName, orgSlug, reps' }, { status: 400 });
  }

  // S30a fast-fail guards (also re-run inside provisionOrg pre-flight, which
  // adds the live host checks — docker ps -a + workspace-dir existence —
  // before any side-effect):
  const fmtErr = validateSlugFormat(orgSlug);
  if (fmtErr) return NextResponse.json({ error: fmtErr }, { status: 400 });
  const reservedErr = checkReservedSlug(orgSlug);
  if (reservedErr) return NextResponse.json({ error: reservedErr }, { status: 409 });

  // Check slug not already taken in the portal DB
  const { data: existing } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
  if (existing) return NextResponse.json({ error: `Slug "${orgSlug}" is already taken` }, { status: 409 });

  const { data: portalUser } = await supabase
    .from('portal_users').select('name, email').eq('supabase_auth_id', user.id).maybeSingle();

  const input: ProvisionInput = {
    orgName, orgSlug,
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
    reps, enabledCrons,
    features: features ?? ['crm'],
    wizard: body.wizard,
  };

  // Create the provision job row
  const svc = createServiceClient(PORTAL_SUPABASE_URL, PORTAL_SUPABASE_KEY);
  const { data: job, error: jobErr } = await svc
    .from('provision_jobs')
    .insert({ org_slug: orgSlug, org_name: orgName, status: 'running', current_step: 'preflight' })
    .select('id')
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create provision job' }, { status: 500 });
  }

  const jobId = job.id;

  // Fire-and-forget: run provisioning in background
  setImmediate(async () => {
    const stepsCompleted: string[] = [];

    const onProgress = async (step: string, _detail?: string) => {
      if (step !== 'complete') stepsCompleted.push(step);
      await svc.from('provision_jobs').update({
        current_step: step,
        steps_completed: stepsCompleted,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
    };

    // S30a: persist the created-resource ledger onto the job row as it grows,
    // so a crashed/stuck job leaves an audit trail of exactly what it made.
    // Tolerant of the resources_created column not existing yet (see
    // scripts/sql/s30a_provision_jobs_resources.sql — additive migration).
    const onResource = (resources: string[]) => {
      svc.from('provision_jobs')
        .update({ resources_created: resources, updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.warn('[provision] resources_created persist failed (non-fatal):', error.message);
        });
    };

    try {
      const result = await provisionOrg(input, onProgress, onResource);

      if (result.success) {
        await svc.from('provision_jobs').update({
          status: 'complete',
          current_step: 'complete',
          steps_completed: stepsCompleted,
          org_id: result.orgId ?? null,
          agent_id: result.agentId ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
      } else {
        await svc.from('provision_jobs').update({
          status: 'failed',
          error: result.error ?? 'Unknown error',
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await svc.from('provision_jobs').update({
        status: 'failed',
        error: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
    }
  });

  return NextResponse.json({ jobId, orgSlug, stepLabels: STEP_LABELS });
}
