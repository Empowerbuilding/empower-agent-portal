import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CRM (Barnhaus) Supabase project — read-only, server-side only. Never expose this key
// to the browser: this route runs on the server and returns only the merged/derived
// data the SMS view needs.
const CRM_URL = 'https://ejsnbluvkqocuchifdvp.supabase.co';
const CRM_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqc25ibHV2a3FvY3VjaGlmZHZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgwMTQ5NywiZXhwIjoyMDgyMzc3NDk3fQ.ZUTMAnnrwi7KPYYhkWL4Gexbn7ClrxOkG_CGWl2Q5X8';

interface CrmActivity {
  id: string;
  contact_id: string | null;
  activity_type: string;
  title: string | null;
  description: string | null;
  created_at: string;
}

interface CrmContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

export async function GET() {
  try {
    // Auth guard — must be a logged-in portal user (any org). This route doesn't
    // filter by org (CRM data is currently Barnhaus-only) but requires auth so the
    // CRM service key is never reachable by an unauthenticated caller.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const crm = createSupabaseClient(CRM_URL, CRM_SERVICE_KEY);

    const { data: activities, error: actErr } = await crm
      .from('activities')
      .select('id, contact_id, activity_type, title, description, created_at')
      .in('activity_type', ['sms_sent', 'sms_received'])
      .order('created_at', { ascending: true })
      .limit(1000);

    if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });

    const contactIds = Array.from(new Set((activities as CrmActivity[] ?? [])
      .map(a => a.contact_id).filter(Boolean))) as string[];

    let contacts: CrmContact[] = [];
    if (contactIds.length) {
      const { data: contactRows } = await crm
        .from('contacts')
        .select('id, first_name, last_name, phone, email')
        .in('id', contactIds);
      contacts = contactRows ?? [];
    }
    const contactMap = new Map(contacts.map(c => [c.id, c]));

    // Pending SMS drafts awaiting approval — from the Portal's own DB
    const { data: draftMessages } = await supabase
      .from('portal_messages')
      .select('id, content, metadata, created_at')
      .eq('channel_id', 'barnhaus-vanessa-sms-drafts')
      .order('created_at', { ascending: false })
      .limit(100);

    const pendingDraftByPhone = new Map<string, { id: string; content: string; created_at: string }>();
    for (const m of draftMessages ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, any>;
      if (meta.approval_state === 'pending' && meta.to) {
        // keep only the most recent pending draft per phone number
        if (!pendingDraftByPhone.has(meta.to)) {
          pendingDraftByPhone.set(meta.to, { id: m.id, content: m.content, created_at: m.created_at });
        }
      }
    }

    // Group activities per contact
    const threadsByContact = new Map<string, CrmActivity[]>();
    for (const a of (activities as CrmActivity[]) ?? []) {
      const key = a.contact_id ?? 'unknown';
      if (!threadsByContact.has(key)) threadsByContact.set(key, []);
      threadsByContact.get(key)!.push(a);
    }

    const threads = Array.from(threadsByContact.entries()).map(([contactId, msgs]) => {
      const contact = contactMap.get(contactId);
      const last = msgs[msgs.length - 1];
      const phone = contact?.phone ?? null;
      const pendingDraft = phone ? pendingDraftByPhone.get(phone) : undefined;
      return {
        contact_id: contactId,
        contact_name: contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Unknown' : 'Unknown contact',
        phone,
        email: contact?.email ?? null,
        message_count: msgs.length,
        last_message: last?.description ?? last?.title ?? '',
        last_message_type: last?.activity_type ?? null,
        last_message_at: last?.created_at ?? null,
        pending_draft: pendingDraft ?? null,
        messages: msgs.map(m => ({
          id: m.id,
          direction: m.activity_type === 'sms_sent' ? 'out' : 'in',
          text: m.description ?? m.title ?? '',
          at: m.created_at,
        })),
      };
    }).sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime());

    return NextResponse.json({ threads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
