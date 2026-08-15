import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      orgId, planName, planSlug, filename, fileKey, fileUrl,
      version, contentType, fileSize, uploadedBy,
      projectName, contactName, category, folderName,
    } = await req.json();

    if (!orgId || !planName || !fileKey) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Archive previous version
    await supabase
      .from('project_files')
      .update({ archived: true })
      .eq('org_id', orgId)
      .eq('plan_slug', planSlug)
      .eq('archived', false);

    // Save metadata
    const { data, error } = await supabase
      .from('project_files')
      .insert({
        org_id: orgId,
        plan_name: planName,
        plan_slug: planSlug,
        filename,
        file_key: fileKey,
        version,
        content_type: contentType || 'application/octet-stream',
        file_size: fileSize,
        uploaded_by: uploadedBy,
        qa_status: 'pending',
        archived: false,
        project_name: projectName || null,
        contact_name: contactName || null,
        file_url: fileUrl,
        category: category || 'project',
        folder_name: folderName?.trim() || 'Unfiled',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ file: data });
  } catch (err: any) {
    console.error('Confirm error:', err);
    return NextResponse.json({ error: err.message || 'Confirm failed' }, { status: 500 });
  }
}
