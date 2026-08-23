/**
 * GET /api/oauth/microsoft/rep?agentId=xxx&rep=stephen&label=Stephen+Burks
 *
 * Generates a Microsoft OAuth URL for a rep to connect their M365 mailbox.
 * No portal login required — designed for sharing during onboarding calls.
 * State encodes: { type: 'rep', agentId, repName, label, exp }
 *
 * Mirrors /api/oauth/google/rep. Uses the multi-tenant `common` endpoint
 * (app registration allows any org + personal accounts).
 */

import { NextRequest, NextResponse } from 'next/server';

// App registration is single-tenant — must use tenant-specific endpoint (AADSTS50194)
const MS_TENANT = process.env.MS_TENANT_ID || 'common';
const MS_AUTH_URL = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.empowerbuilding.ai';
const REDIRECT_URI = `${APP_URL}/api/oauth/microsoft/callback`;

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.ReadWrite',
].join(' ');

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  const repName = searchParams.get('rep');
  const label = searchParams.get('label') ?? repName ?? 'Rep';

  if (!agentId || !repName) {
    return NextResponse.json({ error: 'Missing agentId or rep' }, { status: 400 });
  }

  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Microsoft Client ID not configured on server' }, { status: 500 });
  }

  // State expires in 24h
  const state = Buffer.from(JSON.stringify({
    type: 'rep',
    agentId,
    repName,
    label,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPES,
    prompt: 'select_account',
    state,
  });

  return NextResponse.redirect(`${MS_AUTH_URL}?${params.toString()}`);
}
