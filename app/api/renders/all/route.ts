import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Only Mitchell and Michael can access this
const ALLOWED_NAMES = ['Mitchell', 'Michael'];

const RENDER_TOOL_URL = 'https://weqooskgyaeryoekbhzi.supabase.co';
const RENDER_TOOL_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcW9vc2tneWFlcnlvZWtiaHppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYzNjY4MywiZXhwIjoyMDk5MjEyNjgzfQ.xP3ZoaqYQzmp1WXRf99cioRNQ8R-mJuzxI41aBqdBB8';

export async function GET(req: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('name, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', orgId)
    .single();

  if (!portalUser || !ALLOWED_NAMES.includes(portalUser.name)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const renderClient = createClient(RENDER_TOOL_URL, RENDER_TOOL_SERVICE_KEY);
  const { data: renders, error } = await renderClient
    .from('renders')
    .select('id, created_at, render_type, enhanced_image_url, original_image_url, prompt, profile_id, is_favorited')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ renders: renders ?? [] });
}
