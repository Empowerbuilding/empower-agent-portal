import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify owner role
    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('role')
      .eq('supabase_auth_id', user.id)
      .single();
    if (!portalUser || portalUser.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { channelId } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const sessionKey = `agent:main:portal:channel:${channelId}`;
    const result = await resetSession(sessionKey);
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    console.error('[reset-context] ERROR:', err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function resetSession(sessionKey: string): Promise<string> {
  const { Client } = require('ssh2');
  const host = process.env.RESET_SSH_HOST || '142.93.29.212';
  const container = process.env.RESET_VANESSA_CONTAINER || 'sales-agent-openclaw-gateway-1';
  let privateKey: string;
  const keyFile = '/app/portal-reset.key';
  const sshKeyB64 = process.env.RESET_SSH_KEY;
  try {
    const fs = require('fs');
    if (fs.existsSync(keyFile)) {
      privateKey = fs.readFileSync(keyFile, 'utf8');
    } else if (sshKeyB64) {
      privateKey = Buffer.from(sshKeyB64, 'base64').toString('utf8');
    } else {
      throw new Error('No SSH key available');
    }
  } catch (e: any) {
    throw new Error('SSH key not available: ' + e.message);
  }

  const script = `
import json, shutil, os, sys
path = "/home/node/.openclaw/agents/main/sessions/sessions.json"
key = "${sessionKey}"
with open(path) as f:
    d = json.load(f)
if key not in d:
    print("NOT_FOUND")
    sys.exit(0)
old_file = d[key].get("sessionFile","")
if old_file and os.path.exists(old_file):
    shutil.copy2(old_file, old_file + ".bak")
del d[key]
with open(path, "w") as f:
    json.dump(d, f, indent=2)
print("RESET_OK")
`.trim();

  const command = `docker exec ${container} python3 -c '${script}'`;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); reject(err); return; }
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { output += d.toString(); });
        stream.on('close', () => { conn.end(); resolve(output.trim()); });
      });
    });
    conn.on('error', reject);
    conn.connect({ host, port: 22, username: 'root', privateKey });
  });
}
