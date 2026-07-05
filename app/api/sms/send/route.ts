import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const TELNYX_KEY = process.env.TELNYX_API_KEY!;
const TELNYX_FROM = process.env.TELNYX_FROM_NUMBER || '+18304076296';
const CRM_URL = process.env.CRM_SUPABASE_URL!;
const CRM_KEY = process.env.CRM_SUPABASE_KEY!;
const PORTAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORG_ID = '1c466ccb-ef35-4ba4-bf00-5fcabf20edec';

const USER_OWNER_IDS: Record<string, string> = {
  larry:   '4e86efd2-6335-464b-b286-671b863a9dfc',
  shannon: 'e358d165-3b57-49b7-9f94-beb0b3414697',
};

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, body, channelId, contactName, contactId, userFlag, draftMessageId } = await req.json();
    if (!to || !body || !channelId) return NextResponse.json({ error: 'to, body, channelId required' }, { status: 400 });

    // Send via Telnyx
    const telRes = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TELNYX_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: TELNYX_FROM, to, text: body }),
    });

    if (!telRes.ok) {
      const err = await telRes.text();
      console.error('[sms/send] Telnyx error:', telRes.status, err);
      return NextResponse.json({ ok: false, error: `Telnyx ${telRes.status}: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const telData = await telRes.json();
    const msgId = telData?.data?.id || 'unknown';

    const portal = createServiceClient(PORTAL_URL, PORTAL_SERVICE_KEY, { auth: { persistSession: false } });

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
      // Approving an existing draft — update in place, don't post a duplicate
      const { data: draft } = await portal.from('portal_messages').select('metadata').eq('id', draftMessageId).single();
      if (draft) {
        await portal.from('portal_messages').update({ metadata: { ...draft.metadata, ...sentMeta } }).eq('id', draftMessageId);
      }
    } else {
      // Direct reply — no existing draft, post a new sent message
      await portal.from('portal_messages').insert({
        channel_id: channelId,
        org_id: ORG_ID,
        sender_type: 'system',
        sender_name: userFlag ? (userFlag === 'larry' ? 'Larry' : 'Shannon') : 'Agent',
        content: body,
        metadata: sentMeta,
        processed: true,
      });
    }

    // CRM log (best effort)
    if (CRM_URL && CRM_KEY) {
      try {
        const crm = createServiceClient(CRM_URL, CRM_KEY, { auth: { persistSession: false } });
        const digits = to.replace(/\D/g, '').slice(-10);
        let cId = contactId;
        let existingOwner: string | null = null;

        if (!cId) {
          const { data: contacts } = await crm.from('contacts').select('id,owner_id').ilike('phone', `%${digits}%`).limit(1);
          if (contacts?.[0]) { cId = contacts[0].id; existingOwner = contacts[0].owner_id; }
        }

        if (cId) {
          const now = new Date().toISOString();
          await crm.from('activities').insert({ contact_id: cId, activity_type: 'sms_sent', title: `SMS sent to ${to}`, description: body, created_at: now });
          const patch: Record<string, any> = { last_contacted_at: now, last_contact_type: 'sms_sent' };
          if (userFlag && USER_OWNER_IDS[userFlag]) patch.owner_id = USER_OWNER_IDS[userFlag];
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
