import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Client } from 'ssh2';

export const runtime = 'nodejs';

const SSH_HOST = process.env.AGENT_SSH_HOST || '142.93.29.212';

function getSSHKey(): string {
  const b64 = process.env.RESET_SSH_KEY;
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  // fallback: try reading the key file directly (dev only)
  try {
    const fs = require('fs');
    const keyPath = '/app/portal-reset.key';
    if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8');
  } catch {}
  return '';
}

function sshExec(privateKey: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errOutput = '';
    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); reject(err); return; }
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { errOutput += d.toString(); });
        stream.on('close', (code: number) => {
          conn.end();
          if (code !== 0 && !output) reject(new Error(errOutput || `Exit code ${code}`));
          else resolve(output);
        });
      });
    });
    conn.on('error', reject);
    conn.connect({ host: SSH_HOST, port: 22, username: 'root', privateKey });
  });
}

function getWorkspacePath(containerName: string): string {
  // Vanessa/Atlas share the sales-agent container — their workspace is at a different path
  if (containerName === 'sales-agent-openclaw-gateway-1') {
    return '/root/.openclaw/workspace';
  }
  return `/root/.${containerName.replace('-openclaw', '')}/workspace`;
}

async function authCheck(agentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, container_name, org_id')
    .eq('id', agentId)
    .single();
  if (!agent) return null;

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', agent.org_id)
    .single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) return null;

  return { agent, portalUser };
}

// GET — list all .md files in agent workspace root
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent } = auth;
  const workspacePath = getWorkspacePath(agent.container_name ?? agent.name);
  const privateKey = getSSHKey();
  if (!privateKey) return NextResponse.json({ error: 'SSH key not configured' }, { status: 500 });

  try {
    // List .md files, get their sizes
    const listOutput = await sshExec(privateKey,
      `ls -la ${workspacePath}/*.md 2>/dev/null | awk '{print $5, $9}'`
    );

    const files: { name: string; path: string; size: number }[] = [];
    for (const line of listOutput.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const size = parseInt(parts[0]) || 0;
      const fullPath = parts[1];
      const name = fullPath.split('/').pop() ?? fullPath;
      if (name.endsWith('.md')) files.push({ name, path: fullPath, size });
    }

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

    return NextResponse.json({ files, workspacePath });
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

  const { agent } = auth;
  const workspacePath = getWorkspacePath(agent.container_name ?? agent.name);
  const privateKey = getSSHKey();

  try {
    const content = await sshExec(privateKey, `cat ${workspacePath}/${fileName}`);
    return NextResponse.json({ content });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — save a file and restart agent session
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

  const { agent } = auth;
  const workspacePath = getWorkspacePath(agent.container_name ?? agent.name);
  const containerName = agent.container_name ?? `${agent.name}-openclaw`;
  const privateKey = getSSHKey();

  try {
    // Write file — use printf to preserve newlines and special chars safely
    const escaped = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''");
    await sshExec(privateKey,
      `printf '%s' '${escaped}' > ${workspacePath}/${fileName}`
    );

    // Soft-restart: reset all portal channel sessions for this agent
    // This clears context so the agent re-reads the updated files on next message
    let restartNote = '';
    try {
      const containerCheck = await sshExec(privateKey,
        `docker ps --filter name=${containerName} --format '{{.Names}}'`
      );
      if (containerCheck.trim()) {
        await sshExec(privateKey,
          `docker exec ${containerName} node /app/openclaw.mjs session reset --all 2>/dev/null || true`
        );
        restartNote = 'Agent sessions reset — will reload files on next message.';
      }
    } catch {
      restartNote = 'File saved. Restart the agent manually to apply changes.';
    }

    // Log to agent_file_history if table exists
    const supabase = await createClient();
    await supabase.from('agent_file_history').insert({
      agent_id: agentId,
      file_name: fileName,
      content,
      saved_by: auth.portalUser.id,
    }).then(() => {});  // best-effort, don't fail if table doesn't exist yet

    return NextResponse.json({ success: true, note: restartNote });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
