import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent, agentListFiles, agentReadFile, agentWriteFile, agentDockerExec } from '@/lib/agent-router';

export const runtime = 'nodejs';

async function authCheck(agentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const agent = await getAgent(agentId);
  if (!agent) return null;

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', agent.org_id)
    .single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) return null;

  return { agent, portalUser, supabase };
}

// GET — list all .md files in agent workspace root
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const files = await agentListFiles(agentId);

    // Sort: priority files first, then alphabetical
    const priority = ['SOUL.md', 'AGENTS.md', 'MEMORY.md', 'TOOLS.md', 'USER.md', 'IDENTITY.md'];
    files.sort((a, b) => {
      const ai = priority.indexOf(a.name);
      const bi = priority.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ files, workspacePath: auth.agent.workspace_path });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — read a specific file's content
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileName } = await req.json();
  if (!fileName || !fileName.endsWith('.md') || fileName.includes('/') || fileName.includes('..')) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  try {
    const content = await agentReadFile(agentId, fileName);
    return NextResponse.json({ content });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — save a file and soft-restart agent sessions
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileName, content } = await req.json();
  if (!fileName || !fileName.endsWith('.md') || fileName.includes('/') || fileName.includes('..')) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 });
  }

  try {
    // Write the file
    await agentWriteFile(agentId, fileName, content);

    // Soft-reset all portal sessions so agent re-reads files on next message
    let restartNote = 'File saved. Agent will reload on next message.';
    try {
      await agentDockerExec(agentId,
        `node /app/openclaw.mjs session reset --all 2>/dev/null || true`
      );
      restartNote = 'Saved & applied — agent sessions reset.';
    } catch {
      restartNote = 'File saved. Restart the agent to apply immediately.';
    }

    // Log to agent_file_history (best-effort)
    void auth.supabase.from('agent_file_history').insert({
      agent_id: agentId,
      file_name: fileName,
      content,
      saved_by: auth.portalUser.id,
    });

    return NextResponse.json({ success: true, note: restartNote });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
