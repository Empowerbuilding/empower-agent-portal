import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

// Barnhaus Design OS — source of truth for active design projects.
// Folder names in the File Library stay consistent with project tracking.
const DESIGNOS_URL = process.env.DESIGNOS_URL || 'https://nvsczfrljlovksrdyaix.supabase.co';
// Moved to env (S3). Literal fallback kept only until the key is rotated in S17,
// after which the old value is dead and the fallback is a no-op. git history
// still contains the old key — S17 rotates + scrubs.
const DESIGNOS_SERVICE_KEY = process.env.DESIGNOS_SERVICE_KEY || ''; // S17b: env-only, rotated 2026-09-01

// GET /api/files/folders?orgId=...
// Returns { projects: string[], folders: string[] } for the upload/move folder picker.
export async function GET(req: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  // Must be a member of the org whose folders are being listed
  const { data: member } = await supabase
    .from('portal_users')
    .select('id')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', orgId)
    .single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Design OS projects (active design work — one folder per client project)
  let projects: string[] = [];
  try {
    const designos = createClient(DESIGNOS_URL, DESIGNOS_SERVICE_KEY);
    const { data } = await designos
      .from('projects')
      .select('client_name')
      .order('client_name');
    projects = [...new Set((data ?? []).map(p => (p.client_name ?? '').trim()).filter(Boolean))];
  } catch {
    // Design OS unreachable — picker still works with existing folders
  }

  // Existing folder names already used in the library
  const admin = createAdminClient();
  const { data: fRows } = await admin
    .from('project_files')
    .select('folder_name')
    .eq('org_id', orgId)
    .eq('archived', false);
  const folders = [...new Set((fRows ?? []).map(f => (f.folder_name ?? '').trim()).filter(Boolean))].sort();

  return NextResponse.json({ projects, folders });
}
