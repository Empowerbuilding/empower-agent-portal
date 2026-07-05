/**
 * GET /api/oauth/google/callback
 *
 * Google redirects here after user consent.
 * 1. Exchange code for tokens
 * 2. Fetch account email via userinfo
 * 3. SSH-write google_token.json to agent workspace
 * 4. Update agent_env_vars with account email
 * 5. Sync TOOLS.md section
 * 6. Redirect back to integrations page
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // User denied consent
  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/api/oauth/google/error?reason=${encodeURIComponent(errorParam)}`, APP_URL)
    );
  }

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Decode state
  let state: { agentId: string; returnTo?: string | null };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

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
  // If returnTo is set (e.g. from wizard), go there; otherwise integrations page
  const dest = returnTo ? returnTo : `/${slug}/agents/${agentId}/integrations?connected=google`;
  return NextResponse.redirect(new URL(dest, APP_URL));
}
