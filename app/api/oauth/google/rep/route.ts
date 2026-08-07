/**
 * GET /api/oauth/google/rep?agentId=xxx&rep=ryan&label=Ryan+Haberer
 *
 * Generates a Google OAuth URL for a rep to connect their Gmail.
 * No portal login required — designed for sharing during onboarding calls.
 * State encodes: { type: 'rep', agentId, repName, label, exp }
 */

import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.empowerbuilding.ai';
const REDIRECT_URI = `${APP_URL}/api/oauth/google/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google Client ID not configured on server' }, { status: 500 });
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
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
