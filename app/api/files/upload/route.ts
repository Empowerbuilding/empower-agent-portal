import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSpacesClientDirect, BUCKET } from '@/lib/spaces';
import { requireOrgMember } from '@/lib/api-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';

// Proxy upload: browser sends file to this route, we upload to Spaces server-side.
// No CORS issues — same origin as the portal.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const planName = formData.get('planName') as string;
    const projectName = (formData.get('projectName') as string) || null;
    const contactName = (formData.get('contactName') as string) || null;
    const orgId = formData.get('orgId') as string;
    const uploadedBy = formData.get('uploadedBy') as string;
    const category = (formData.get('category') as string) || 'project';

    if (!file || !planName || !orgId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const auth = await requireOrgMember(orgId);
    if (!auth.ok) return auth.response;

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
    const key = `${orgId}/${slug}/v${nextVersion}/${file.name}`;
    const region = process.env.DO_SPACES_REGION || 'sfo3';
    const endpoint = process.env.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`;
    const fileUrl = `${endpoint}/${BUCKET}/${key}`;

    // Upload to Spaces server-side — no CORS needed
    const buffer = Buffer.from(await file.arrayBuffer());
    const spacesClient = getSpacesClientDirect();
    await spacesClient.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    }));

    // Archive previous version
    await supabase
      .from('project_files')
      .update({ archived: true })
      .eq('org_id', orgId)
      .eq('plan_slug', slug)
      .eq('archived', false);

    // Save metadata
    const { data, error } = await supabase
      .from('project_files')
      .insert({
        org_id: orgId,
        plan_name: planName,
        plan_slug: slug,
        filename: file.name,
        file_key: key,
        version: nextVersion,
        content_type: file.type || 'application/octet-stream',
        file_size: file.size,
        uploaded_by: uploadedBy,
        qa_status: 'pending',
        archived: false,
        project_name: projectName || null,
        contact_name: contactName || null,
        file_url: fileUrl,
        category,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ file: data });

  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
