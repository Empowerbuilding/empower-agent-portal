import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUploadUrl, getDownloadUrl } from '@/lib/spaces';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/files?orgId=...&userId=...&role=...
// Returns project_files list, scoped for contractors
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const userId = searchParams.get('userId');
  const role = searchParams.get('role');

  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  let query = supabase
    .from('project_files')
    .select('*')
    .eq('org_id', orgId)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  // Reps only see design files
  if (role === 'rep') {
    query = query.eq('category', 'design');
  }

  // Contractors only see files tied to their tasks
  if (role === 'contractor' && userId) {
    const { data: tasks } = await supabase
      .from('production_tasks')
      .select('file_id')
      .eq('drafter', userId)
      .not('file_id', 'is', null);

    const fileIds = (tasks ?? []).map((t: any) => t.file_id).filter(Boolean);
    if (fileIds.length === 0) return NextResponse.json({ files: [] });
    query = query.in('id', fileIds);
  }

  const { data: files, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: files ?? [] });
}

// POST /api/files
// body: { action: 'presign-upload' | 'confirm-upload' | 'presign-download' | 'archive', ...}
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  // ── Presign upload ──────────────────────────────────────────────────────────
  if (action === 'presign-upload') {
    const { planName, filename, contentType, orgId, uploadedBy } = body;
    if (!planName || !filename || !contentType || !orgId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Determine version
    const slug = planName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
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

    const uploadUrl = await getUploadUrl(key, contentType);
    return NextResponse.json({ uploadUrl, key, version: nextVersion, planSlug: slug });
  }

  // ── Confirm upload (save metadata) ─────────────────────────────────────────
  if (action === 'confirm-upload') {
    const { key, planName, planSlug, filename, version, contentType, orgId, uploadedBy, fileSize, projectName, contactName } = body;
    const _region = process.env.DO_SPACES_REGION || 'sfo3';
    const _endpoint = process.env.DO_SPACES_ENDPOINT || `https://${_region}.digitaloceanspaces.com`;
    const _bucket = process.env.DO_SPACES_BUCKET || 'barnhaus-project-files';
    const fileUrl = `${_endpoint}/${_bucket}/${key}`;

    // Archive previous version
    await supabase
      .from('project_files')
      .update({ archived: true })
      .eq('org_id', orgId)
      .eq('plan_slug', planSlug)
      .eq('archived', false);

    const { data, error } = await supabase
      .from('project_files')
      .insert({
        org_id: orgId,
        plan_name: planName,
        plan_slug: planSlug,
        filename,
        file_key: key,
        version,
        content_type: contentType,
        file_size: fileSize ?? null,
        uploaded_by: uploadedBy,
        qa_status: 'pending',
        archived: false,
        project_name: projectName ?? null,
        contact_name: contactName ?? null,
        file_url: fileUrl,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ file: data });
  }

  // ── Presign download ────────────────────────────────────────────────────────
  if (action === 'presign-download') {
    const { fileKey, filename } = body;
    if (!fileKey || !filename) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const downloadUrl = await getDownloadUrl(fileKey, filename);
    return NextResponse.json({ downloadUrl });
  }

  // ── Archive file ────────────────────────────────────────────────────────────
  if (action === 'archive') {
    const { fileId, orgId } = body;
    await supabase.from('project_files').update({ archived: true }).eq('id', fileId).eq('org_id', orgId);
    return NextResponse.json({ ok: true });
  }

  // ── Update QA status ────────────────────────────────────────────────────────
  if (action === 'qa-update') {
    const { fileId, qaStatus, qaNotes, orgId } = body;
    const { error } = await supabase
      .from('project_files')
      .update({ qa_status: qaStatus, qa_notes: qaNotes ?? null })
      .eq('id', fileId)
      .eq('org_id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
