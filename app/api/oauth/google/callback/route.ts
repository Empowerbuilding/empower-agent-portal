/**
 * GET /api/oauth/google/callback
 *
 * Google redirects here after user consent.
 *
 * Two flows:
 *
 * 1. Agent flow (state.type == null | 'agent')
 *    — Owner/admin connects the agent's own Gmail account.
 *    — Requires portal login + owner/admin role.
 *    — Writes google_token.json to agent workspace.
 *
 * 2. Rep flow (state.type == 'rep')
 *    — Sales rep connects their personal Gmail for inbox scanning.
 *    — No portal login required (shareable link).
 *    — Writes <repName>_token.json to agent workspace.
 *    — Returns a standalone success page (no redirect).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent, agentWriteFile } from '@/lib/agent-router';
import { syncIntegrationToToolsMd } from '@/lib/tools-md-writer';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.empowerbuilding.ai';
const REDIRECT_URI = `${APP_URL}/api/oauth/google/callback`;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Standalone HTML success page — no portal login needed. */
function successPage(label: string, email: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gmail Connected</title>
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
    <h1>Gmail Connected</h1>
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

  // User denied consent
  if (errorParam) {
    // Decode state to check if rep flow (show HTML page instead of redirect)
    let isRepFlow = false;
    try {
      const s = JSON.parse(Buffer.from(stateRaw ?? '', 'base64url').toString());
      isRepFlow = s.type === 'rep';
    } catch { /* ignore */ }

    if (isRepFlow) return errorPage(`Authorization was denied: ${errorParam}`);
    return NextResponse.redirect(
      new URL(`/api/oauth/google/error?reason=${encodeURIComponent(errorParam)}`, APP_URL)
    );
  }

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Decode state
  let state: { type?: string; agentId: string; repName?: string; label?: string; exp?: number; returnTo?: string | null };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  // ── REP FLOW ──────────────────────────────────────────────────────────────
  if (state.type === 'rep') {
    const { agentId, repName, label = repName ?? 'Rep', exp } = state;

    // Check expiry
    if (exp && Date.now() > exp) {
      return errorPage('This link has expired. Ask your admin to send a new one.');
    }

    // Use system-level credentials
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return errorPage('Server configuration error: Google credentials missing.');
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
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      console.error('[rep oauth] Token exchange failed:', tokens);
      return errorPage(`Token exchange failed: ${tokens.error_description ?? tokens.error ?? 'unknown error'}`);
    }

    // Fetch account email
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();
    const accountEmail = userInfo.email ?? '';

    // Write <repName>_token.json to agent workspace
    const tokenJson = JSON.stringify({
      token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_uri: TOKEN_URL,
      client_id: clientId,
      client_secret: clientSecret,
      scopes: tokens.scope?.split(' ') ?? [],
      expiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    }, null, 2);

    const tokenFile = `${repName}_token.json`;
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
        content: `✅ ${label} connected Gmail: ${accountEmail} → ${tokenFile} (agent: ${agent.container_name})`,
        processed: true,
      });
    } catch (e) {
      console.warn('[rep oauth] portal notify failed:', e);
    }

    return successPage(label!, accountEmail);
  }

  // ── AGENT FLOW (existing) ──────────────────────────────────────────────────
  const { agentId, returnTo } = state;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', APP_URL));

  const agent = await getAgent(agentId);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', agent.org_id)
    .single();

  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Get client credentials from DB
  const { data: envVars } = await supabase
    .from('agent_env_vars')
    .select('key, value')
    .eq('agent_id', agentId)
    .eq('integration_id', 'google')
    .in('key', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);

  const clientId = envVars?.find((v: any) => v.key === 'GOOGLE_CLIENT_ID')?.value;
  const clientSecret = envVars?.find((v: any) => v.key === 'GOOGLE_CLIENT_SECRET')?.value;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google credentials not configured' }, { status: 400 });
  }

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
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    console.error('Token exchange failed:', tokens);
    return NextResponse.json({ error: 'Token exchange failed', detail: tokens.error_description }, { status: 500 });
  }

  // Fetch account email
  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userRes.json();
  const accountEmail = userInfo.email ?? '';

  // Write google_token.json to agent workspace
  const tokenJson = JSON.stringify({
    token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_uri: TOKEN_URL,
    client_id: clientId,
    client_secret: clientSecret,
    scopes: tokens.scope?.split(' ') ?? [],
    expiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
  }, null, 2);

  await agentWriteFile(agentId, 'google_token.json', tokenJson);

  // Save account email to DB
  const now = new Date().toISOString();
  await supabase.from('agent_env_vars').upsert([{
    agent_id: agentId,
    key: 'GOOGLE_ACCOUNT_EMAIL',
    value: accountEmail,
    display_name: 'Google Account Email',
    integration_id: 'google',
    is_secret: false,
    updated_at: now,
  }], { onConflict: 'agent_id,key' });

  // Sync TOOLS.md
  try {
    await syncIntegrationToToolsMd(agentId, 'google', { GOOGLE_ACCOUNT_EMAIL: accountEmail });
  } catch (e) {
    console.warn('tools-md sync failed:', e);
  }

  // Find the org slug for redirect
  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', agent.org_id)
    .single();

  const slug = (org as any)?.slug ?? '';
  const dest = returnTo ? returnTo : `/${slug}/agents/${agentId}/integrations?connected=google`;
  return NextResponse.redirect(new URL(dest, APP_URL));
}
