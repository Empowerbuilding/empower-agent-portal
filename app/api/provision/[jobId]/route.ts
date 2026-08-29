import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/api-auth';

export const runtime = 'nodejs';

const PORTAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Require a logged-in user. Org-scoping isn't possible here (the org may not
  // exist yet mid-provision), but this stops anon enumeration of job
  // status/org-name/ids/errors.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient(PORTAL_SUPABASE_URL, PORTAL_SUPABASE_KEY);
  const { data: job, error } = await svc
    .from('provision_jobs')
    .select('id, org_slug, org_name, status, current_step, steps_completed, error, org_id, agent_id, updated_at')
    .eq('id', jobId)
    .single();

  if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}
