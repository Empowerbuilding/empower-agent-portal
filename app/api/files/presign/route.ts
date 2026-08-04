import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUploadUrl, BUCKET } from '@/lib/spaces';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType, planName, orgId, uploadedBy, projectName, contactName, category } = await req.json();

    if (!filename || !planName || !orgId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const slug = planName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Determine version
    const { data: existing } = await supabase
      .from('project_files')
      .select('version')
      .eq('org_id', orgId)
      .eq('plan_slug', slug)
      .eq('archived', false)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;
    const key = `${orgId}/${slug}/v${nextVersion}/${filename}`;
    const region = process.env.DO_SPACES_REGION || 'sfo3';
    const endpoint = process.env.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`;
    const fileUrl = `${endpoint}/${BUCKET}/${key}`;

    // Generate presigned PUT URL — browser uploads directly to DO Spaces
    const uploadUrl = await getUploadUrl(key, contentType || 'application/octet-stream');

    return NextResponse.json({
      uploadUrl,
      key,
      fileUrl,
      nextVersion,
      slug,
    });
  } catch (err: any) {
    console.error('Presign error:', err);
    return NextResponse.json({ error: err.message || 'Presign failed' }, { status: 500 });
  }
}
