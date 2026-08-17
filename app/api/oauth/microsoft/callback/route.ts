/**
 * GET /api/oauth/microsoft/callback
 *
 * Microsoft redirects here after user consent.
 *
 * Rep flow only (state.type == 'rep'):
 *  — Sales rep connects their M365 mailbox for inbox scanning.
 *  — No portal login required (shareable link).
 *  — Writes <repName>_ms_token.json to agent workspace.
 *  — Returns a standalone success page (no redirect).
 *
 * Mirrors the rep flow in /api/oauth/google/callback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgent, agentWriteFile } from '@/lib/agent-router';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.empowerbuilding.ai';
const REDIRECT_URI = `${APP_URL}/api/oauth/microsoft/callback`;
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';

/** Standalone HTML success page — no portal login needed. */
function successPage(label: string, email: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Microsoft 365 Connected</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #f1f5f9; }
    .email { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #052e16;
      border: 1px solid #16a34a;
      color: #4ade80;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 99px;
    }
    p { font-size: 14px; color: #64748b; margin-top: 24px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Microsoft 365 Connected</h1>
    <div class="email">${email}</div>
    <div class="badge">🔒 Secure connection established</div>
    <p>You're all set, ${label}. You can close this tab.</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

/** Standalone HTML error page. */
function errorPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Connection Failed</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a; color: #e2e8f0;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .card {
      background: #1e293b; border: 1px solid #7f1d1d;
      border-radius: 16px; padding: 48px 40px;
      max-width: 440px; width: 100%; text-align: center;
    }
    .icon { font-size: 56px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 700; color: #fca5a5; margin-bottom: 12px; }
    p { font-size: 14px; color: #94a3b8; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Connection Failed</h1>
    <p>${message}</p>
    <p style="margin-top:16px">Please close this tab and try again, or contact your admin.</p>
  </div>
</body>
</html>`,
    { status: 400, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // User denied consent or Azure returned an error (e.g. missing admin consent)
  if (errorParam) {
    const desc = searchParams.get('error_description') ?? '';
    return errorPage(`Authorization failed: ${errorParam}${desc ? ` — ${desc}` : ''}`);
  }

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Decode state
  let state: { type?: string; agentId: string; repName?: string; label?: string; exp?: number };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  if (state.type !== 'rep') {
    return NextResponse.json({ error: 'Unsupported flow' }, { status: 400 });
  }

  const { agentId, repName, label = repName ?? 'Rep', exp } = state;

  // Check expiry
  if (exp && Date.now() > exp) {
    return errorPage('This link has expired. Ask your admin to send a new one.');
  }

  // System-level credentials
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorPage('Server configuration error: Microsoft credentials missing.');
  }

  const agent = await getAgent(agentId);
  if (!agent) return errorPage('Agent not found. Contact your admin.');

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'openid profile email offline_access https://graph.microsoft.com/Mail.Read',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    console.error('[ms rep oauth] Token exchange failed:', tokens);
    return errorPage(`Token exchange failed: ${tokens.error_description ?? tokens.error ?? 'unknown error'}`);
  }

  // Fetch account email from Graph
  let accountEmail = '';
  try {
    const meRes = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meRes.json();
    accountEmail = me.mail ?? me.userPrincipalName ?? '';
  } catch (e) {
    console.warn('[ms rep oauth] Graph /me lookup failed:', e);
  }

  // Write <repName>_ms_token.json to agent workspace
  const tokenJson = JSON.stringify({
    token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_uri: TOKEN_URL,
    client_id: clientId,
    client_secret: clientSecret,
    scopes: tokens.scope?.split(' ') ?? [],
    expiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    account_email: accountEmail,
    provider: 'microsoft',
  }, null, 2);

  const tokenFile = `${repName}_ms_token.json`;
  await agentWriteFile(agentId, tokenFile, tokenJson);

  // Notify via Portal Supabase (non-fatal)
  try {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js');
    const adminSb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await adminSb.from('portal_messages').insert({
      channel_id: 'tony-coding',
      org_id: agent.org_id,
      sender_type: 'system',
      sender_name: 'OAuth',
      content: `✅ ${label} connected Microsoft 365: ${accountEmail} → ${tokenFile} (agent: ${agent.container_name})`,
      processed: true,
    });
  } catch (e) {
    console.warn('[ms rep oauth] portal notify failed:', e);
  }

  return successPage(label!, accountEmail);
}
