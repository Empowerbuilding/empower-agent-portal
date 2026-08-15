import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

// Barnhaus Design OS — source of truth for active design projects.
// Folder names in the File Library stay consistent with project tracking.
const DESIGNOS_URL = 'https://nvsczfrljlovksrdyaix.supabase.co';
const DESIGNOS_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52c2N6ZnJsamxvdmtzcmR5YWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYzODQ3MywiZXhwIjoyMDk0MjE0NDczfQ.Rl8IVENc0WSpMm3d7JQzwpPV_ILp2_b6ohn1aWX-cuc';

// GET /api/files/folders?orgId=...
// Returns { projects: string[], folders: string[] } for the upload/move folder picker.
export async function GET(req: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

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
