/**
 * GET /api/oauth/google?agentId=xxx
 *
 * Redirects the user to Google's OAuth consent screen.
 * On return, Google hits /api/oauth/google/callback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent } from '@/lib/agent-router';

export const runtime = 'nodejs';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.empowerbuilding.ai'}/api/oauth/google/callback`;

// Scopes needed for Gmail + Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
].join(' ');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
  }

  // Auth check — must be owner/admin of this agent's org
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

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

  // Get the Google client ID from the agent's env vars
  const { data: envVars } = await supabase
    .from('agent_env_vars')
    .select('key, value')
    .eq('agent_id', agentId)
    .eq('integration_id', 'google')
    .in('key', ['GOOGLE_CLIENT_ID']);

  const clientId = envVars?.find((v: any) => v.key === 'GOOGLE_CLIENT_ID')?.value;
  if (!clientId) {
    return NextResponse.json({
      error: 'Google Client ID not configured. Add it in the Google integration card first.',
    }, { status: 400 });
  }

  // Encode agentId + optional returnTo in state so callback knows who to write to and where to redirect
  const returnTo = searchParams.get('returnTo') || null;
  const state = Buffer.from(JSON.stringify({ agentId, returnTo })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',  // Always show consent to get refresh_token
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
