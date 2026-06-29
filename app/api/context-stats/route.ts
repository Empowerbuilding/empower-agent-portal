import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await fetchContextStats();
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function fetchContextStats(): Promise<Record<string, { tokens: number; ctx: number; pct: number }>> {
  const { Client } = require('ssh2');
  const host = process.env.RESET_SSH_HOST || '142.93.29.212';
  const container = process.env.RESET_VANESSA_CONTAINER || 'sales-agent-openclaw-gateway-1';
  const sshKeyB64 = process.env.RESET_SSH_KEY || 'LS0tLS1CRUdJTiBPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS0KYjNCbGJuTnphQzFyWlhrdGRqRUFBQUFBQkc1dmJtVUFBQUFFYm05dVpRQUFBQUFBQUFBQkFBQUFNd0FBQUF0emMyZ3RaVwpReU5UVXhPUUFBQUNBNmFRQzdBNnFrWUszbjFJaHpnZGdjRmxRdFk4clBVbit0ZDYrdWVOeXVmZ0FBQUtCVlpEanVWV1E0CjdnQUFBQXR6YzJndFpXUXlOVFV4T1FBQUFDQTZhUUM3QTZxa1lLM24xSWh6Z2RnY0ZsUXRZOHJQVW4rdGQ2K3VlTnl1ZmcKQUFBRURIYk9RU254SjFxWjJKbUV0YmJnRTJTWnQxSmd1eFM5MlROelZYNnBYWEVEcHBBTHNEcXFSZ3JlZlVpSE9CMkJ3VwpWQzFqeXM5U2Y2MTNyNjU0M0s1K0FBQUFHMjFwZEdOb1pXeGxRR1Z0Y0c5M1pXSmpkV2xzWkdsdVp5NWhhUUVDCi0tLS0tRU5EIE9QRU5TU0ggUFJJVkFURSBLRVktLS0tLQo=';
  if (!sshKeyB64) return {};

  const privateKey = Buffer.from(sshKeyB64, 'base64').toString('utf8');

  const command = `docker exec ${container} python3 -c "
import json
path = '/home/node/.openclaw/agents/main/sessions/sessions.json'
with open(path) as f:
    d = json.load(f)
out = {}
for k, v in d.items():
    if 'portal:channel:' in k:
        channel_id = k.split('portal:channel:')[-1]
        tokens = v.get('totalTokens', 0)
        ctx = v.get('contextTokens', 1)
        out[channel_id] = {'tokens': tokens, 'ctx': ctx, 'pct': round(tokens/ctx*100, 1)}
print(json.dumps(out))
"`;

  return new Promise((resolve) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); resolve({}); return; }
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.on('close', () => {
          conn.end();
          try { resolve(JSON.parse(output.trim())); }
          catch { resolve({}); }
        });
      });
    });
    conn.on('error', () => resolve({}));
    conn.connect({ host, port: 22, username: 'root', privateKey });
  });
}
