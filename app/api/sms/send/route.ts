import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const TELNYX_KEY = process.env.TELNYX_API_KEY!;
const PORTAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, body, channelId, contactName, contactId, userFlag, draftMessageId } = await req.json();
    if (!to || !body || !channelId) return NextResponse.json({ error: 'to, body, channelId required' }, { status: 400 });

    const portal = createServiceClient(PORTAL_URL, PORTAL_SERVICE_KEY, { auth: { persistSession: false } });

    // ── Look up channel → org + agent ────────────────────────────────────────
    const { data: channel, error: chErr } = await portal
      .from('portal_channels')
      .select('org_id, agent_id')
      .eq('id', channelId)
      .single();
    if (chErr || !channel) {
      console.error('[sms/send] Channel lookup failed:', chErr?.message);
      return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
    }
    const { org_id: orgId, agent_id: agentId } = channel;

    // ── Look up agent → Telnyx phone number ──────────────────────────────────
    const { data: agent } = await portal
      .from('agents')
      .select('telnyx_phone_number')
      .eq('id', agentId)
      .single();
    const telnyxFrom = agent?.telnyx_phone_number || process.env.TELNYX_FROM_NUMBER || '+18304076296';

    // ── Look up org → CRM credentials ────────────────────────────────────────
    const { data: org } = await portal
      .from('organizations')
      .select('crm_supabase_url, crm_supabase_key')
      .eq('id', orgId)
      .single();
    const crmUrl = org?.crm_supabase_url || null;
    const crmKey = org?.crm_supabase_key || null;

    // ── Look up sending rep → crm_user_id for owner update ───────────────────
    let repCrmUserId: string | null = null;
    let repDisplayName = userFlag || 'Agent';
    if (userFlag) {
      const { data: repUser } = await portal
        .from('portal_users')
        .select('crm_user_id, name')
        .eq('org_id', orgId)
        .ilike('name', `%${userFlag}%`)
        .limit(1)
        .single();
      if (repUser) {
        repCrmUserId = repUser.crm_user_id || null;
        repDisplayName = repUser.name || userFlag;
      }
    }

    // ── Send via Telnyx ───────────────────────────────────────────────────────
    const telRes = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TELNYX_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: telnyxFrom, to, text: body }),
    });

    if (!telRes.ok) {
      const err = await telRes.text();
      console.error('[sms/send] Telnyx error:', telRes.status, err);
      return NextResponse.json({ ok: false, error: `Telnyx ${telRes.status}: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const telData = await telRes.json();
    const msgId = telData?.data?.id || 'unknown';

    // ── Write to portal_messages ──────────────────────────────────────────────
    const sentMeta = {
      approval_state: 'sent',
      contact_phone: to,
      contact_name: contactName || null,
      contact_id: contactId || null,
      direction: 'outbound',
      to,
      sent_by: userFlag || 'direct',
      telnyx_id: msgId,
    };

    if (draftMessageId) {
      // Approving an existing draft — update in place
      const { data: draft } = await portal.from('portal_messages').select('metadata').eq('id', draftMessageId).single();
      if (draft) {
        await portal.from('portal_messages').update({ metadata: { ...draft.metadata, ...sentMeta } }).eq('id', draftMessageId);
      }
    } else {
      // Direct reply — post new sent message
      await portal.from('portal_messages').insert({
        channel_id: channelId,
        org_id: orgId,
        sender_type: 'system',
        sender_name: repDisplayName,
        content: body,
        metadata: sentMeta,
        processed: true,
      });
    }

    // ── CRM log (best effort) ─────────────────────────────────────────────────
    if (crmUrl && crmKey) {
      try {
        const crm = createServiceClient(crmUrl, crmKey, { auth: { persistSession: false } });
        const digits = to.replace(/\D/g, '').slice(-10);
        let cId = contactId;

        if (!cId) {
          const { data: contacts } = await crm.from('contacts').select('id,owner_id').ilike('phone', `%${digits}%`).limit(1);
          if (contacts?.[0]) cId = contacts[0].id;
        }

        if (cId) {
          const now = new Date().toISOString();
          await crm.from('activities').insert({ contact_id: cId, activity_type: 'sms_sent', title: `SMS sent to ${to}`, description: body, created_at: now });
          const patch: Record<string, any> = { last_contacted_at: now, last_contact_type: 'sms_sent' };
          if (repCrmUserId) patch.owner_id = repCrmUserId;
          await crm.from('contacts').update(patch).eq('id', cId);
        }
      } catch (e) {
        console.warn('[sms/send] CRM log failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ ok: true, telnyx_id: msgId });
  } catch (err: any) {
    console.error('[sms/send] ERROR:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
