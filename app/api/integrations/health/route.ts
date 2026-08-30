import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMember } from '@/lib/api-auth';
import { getAgent, agentReadFile, agentListFiles } from '@/lib/agent-router';
import { createClient } from '@supabase/supabase-js';

// S27 — live integration health for one agent.
// POST { agentId } → [{ integration, account, status, detail, reconnectUrl }]
// status: healthy | needs_reconnect | error | not_configured
// Live checks: Google/MS token refresh grants, Telnyx/Resend/Supabase key pings.

export const maxDuration = 60;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HealthItem {
  integration: string;
  icon: string;
  account: string | null;
  status: 'healthy' | 'needs_reconnect' | 'error' | 'not_configured';
  detail: string;
  reconnectUrl: string | null;
  lastSuccess: string | null;
}

async function checkGoogle(agentId: string, envMap: Record<string, string>): Promise<HealthItem | null> {
  let raw: string;
  try {
    raw = await agentReadFile(agentId, 'google_token.json');
  } catch {
    return null; // no token file — not configured for gmail
  }
  const item: HealthItem = {
    integration: 'Google (Gmail/Calendar)', icon: '📧',
    account: envMap['GOOGLE_ACCOUNT_EMAIL'] ?? null,
    status: 'error', detail: '', reconnectUrl: `/api/oauth/google?agentId=${agentId}`,
    lastSuccess: null,
  };
  let tok: any;
  try { tok = JSON.parse(raw); } catch { item.detail = 'token file unreadable'; return item; }
  if (!tok.refresh_token || !tok.client_id) { item.detail = 'token file incomplete'; item.status = 'needs_reconnect'; return item; }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tok.refresh_token,
        client_id: tok.client_id,
        client_secret: tok.client_secret ?? '',
      }),
    });
    const j = await r.json();
    if (r.ok && j.access_token) {
      item.status = 'healthy'; item.detail = 'token refresh OK'; item.lastSuccess = new Date().toISOString();
    } else if (j.error === 'invalid_grant') {
      item.status = 'needs_reconnect'; item.detail = 'refresh token revoked/expired (invalid_grant)';
    } else {
      item.status = 'error'; item.detail = `refresh failed: ${j.error ?? r.status}`;
    }
  } catch (e: any) {
    item.detail = `network: ${String(e?.message).slice(0, 80)}`;
  }
  return item;
}

async function checkMicrosoft(agentId: string): Promise<HealthItem[]> {
  let files: { name: string }[] = [];
  try {
    files = (await agentListFiles(agentId)).filter((f) => /_ms_token\.json$/.test(f.name));
  } catch { return []; }
  const out: HealthItem[] = [];
  for (const f of files.slice(0, 8)) {
    const rep = f.name.replace(/_ms_token\.json$/, '');
    const item: HealthItem = {
      integration: `Microsoft 365 (${rep})`, icon: '📨', account: null,
      status: 'error', detail: '', lastSuccess: null,
      reconnectUrl: `/api/oauth/microsoft/rep?agentId=${agentId}&rep=${encodeURIComponent(rep)}`,
    };
    try {
      const tok = JSON.parse(await agentReadFile(agentId, f.name));
      item.account = tok.account ?? tok.email ?? tok.username ?? null;
      const tenant = tok.tenant_id ?? tok.tenant ?? 'common';
      if (!tok.refresh_token || !tok.client_id) {
        item.status = 'needs_reconnect'; item.detail = 'token file incomplete';
      } else {
        const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tok.refresh_token,
            client_id: tok.client_id,
            client_secret: tok.client_secret ?? '',
            scope: tok.scope ?? 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
          }),
        });
        const j = await r.json();
        if (r.ok && j.access_token) {
          item.status = 'healthy'; item.detail = 'token refresh OK'; item.lastSuccess = new Date().toISOString();
        } else if (['invalid_grant', 'interaction_required'].includes(j.error)) {
          item.status = 'needs_reconnect'; item.detail = `re-auth required (${j.error})`;
        } else {
          item.status = 'error'; item.detail = `refresh failed: ${j.error ?? r.status}`;
        }
      }
    } catch (e: any) {
      item.detail = `check failed: ${String(e?.message).slice(0, 80)}`;
    }
    out.push(item);
  }
  return out;
}

async function checkTelnyx(envMap: Record<string, string>): Promise<HealthItem | null> {
  const key = envMap['TELNYX_API_KEY'];
  if (!key) return null;
  const item: HealthItem = {
    integration: 'Telnyx (SMS)', icon: '📱', account: envMap['TELNYX_FROM_NUMBER'] ?? null,
    status: 'error', detail: '', reconnectUrl: null, lastSuccess: null,
  };
  try {
    const r = await fetch('https://api.telnyx.com/v2/balance', { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) { item.status = 'healthy'; item.detail = 'API key valid'; item.lastSuccess = new Date().toISOString(); }
    else if (r.status === 401) { item.status = 'needs_reconnect'; item.detail = 'API key invalid/revoked'; }
    else { item.detail = `HTTP ${r.status}`; }
  } catch (e: any) { item.detail = `network: ${String(e?.message).slice(0, 80)}`; }
  return item;
}

async function checkResend(envMap: Record<string, string>): Promise<HealthItem | null> {
  const key = envMap['RESEND_API_KEY'];
  if (!key) return null;
  const item: HealthItem = {
    integration: 'Resend (Email)', icon: '✉️', account: envMap['RESEND_FROM_EMAIL'] ?? null,
    status: 'error', detail: '', reconnectUrl: null, lastSuccess: null,
  };
  try {
    const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) { item.status = 'healthy'; item.detail = 'API key valid'; item.lastSuccess = new Date().toISOString(); }
    else if (r.status === 401) { item.status = 'needs_reconnect'; item.detail = 'API key invalid/revoked'; }
    else { item.detail = `HTTP ${r.status}`; }
  } catch (e: any) { item.detail = `network: ${String(e?.message).slice(0, 80)}`; }
  return item;
}

async function checkCrmSupabase(envMap: Record<string, string>): Promise<HealthItem | null> {
  const url = envMap['SUPABASE_URL'];
  const key = envMap['SUPABASE_SERVICE_KEY'];
  if (!url || !key) return null;
  const item: HealthItem = {
    integration: 'CRM Database', icon: '🗄️', account: url.replace(/^https?:\/\//, '').split('.')[0],
    status: 'error', detail: '', reconnectUrl: null, lastSuccess: null,
  };
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/?apikey=${encodeURIComponent(key)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (r.ok) { item.status = 'healthy'; item.detail = 'reachable'; item.lastSuccess = new Date().toISOString(); }
    else if ([401, 403].includes(r.status)) { item.status = 'needs_reconnect'; item.detail = 'service key rejected'; }
    else { item.detail = `HTTP ${r.status}`; }
  } catch (e: any) { item.detail = `network: ${String(e?.message).slice(0, 80)}`; }
  return item;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const agentId = String(body?.agentId ?? '');
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

  const agent = await getAgent(agentId);
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  const auth = await requireOrgMember(agent.org_id);
  if (!auth.ok) return auth.response;
  if (!['owner', 'admin'].includes(auth.role ?? '')) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const { data: envVars } = await admin
    .from('agent_env_vars')
    .select('key, value')
    .eq('agent_id', agentId);
  const envMap: Record<string, string> = {};
  for (const v of envVars ?? []) envMap[v.key] = v.value;

  const [google, microsoft, telnyx, resend, crm] = await Promise.all([
    checkGoogle(agentId, envMap),
    checkMicrosoft(agentId),
    checkTelnyx(envMap),
    checkResend(envMap),
    checkCrmSupabase(envMap),
  ]);

  const items = [google, ...microsoft, telnyx, resend, crm].filter(Boolean);
  return NextResponse.json({ agentId, items });
}
