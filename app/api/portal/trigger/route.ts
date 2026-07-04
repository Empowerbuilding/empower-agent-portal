import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Internal API key — set PORTAL_TRIGGER_SECRET in env
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.PORTAL_TRIGGER_SECRET
  if (!secret) return false
  const auth = req.headers.get('x-trigger-secret') || req.headers.get('authorization')?.replace('Bearer ', '')
  return auth === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    orgId: string
    channelId: string
    content: string
    senderType?: string
    metadata?: Record<string, unknown>
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { orgId, channelId, content, senderType = 'system', metadata } = body

  if (!orgId || !channelId || !content) {
    return NextResponse.json({ error: 'Missing required fields: orgId, channelId, content' }, { status: 400 })
  }

  // Verify the channel belongs to this org
  const { data: channel, error: channelErr } = await supabase
    .from('portal_channels')
    .select('id, org_id')
    .eq('channel_id', channelId)
    .eq('org_id', orgId)
    .single()

  if (channelErr || !channel) {
    return NextResponse.json({ error: 'Channel not found or does not belong to org' }, { status: 404 })
  }

  // Insert the message
  const { data: msg, error: insertErr } = await supabase
    .from('portal_messages')
    .insert({
      channel_id: channelId,
      org_id: orgId,
      sender_type: senderType,
      content,
      metadata: metadata || null,
    })
    .select('id, created_at')
    .single()

  if (insertErr) {
    console.error('[portal/trigger] insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to insert message' }, { status: 500 })
  }

  return NextResponse.json({ success: true, messageId: msg.id, createdAt: msg.created_at })
}
