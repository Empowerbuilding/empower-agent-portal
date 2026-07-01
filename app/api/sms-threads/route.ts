import { NextResponse, NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CRM (Barnhaus) Supabase project — read-only, server-side only. Never expose this key
// to the browser: this route runs on the server and returns only the merged/derived
// data the SMS approval view needs.
const CRM_URL = 'https://ejsnbluvkqocuchifdvp.supabase.co';
const CRM_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqc25ibHV2a3FvY3VjaGlmZHZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgwMTQ5NywiZXhwIjoyMDgyMzc3NDk3fQ.ZUTMAnnrwi7KPYYhkWL4Gexbn7ClrxOkG_CGWl2Q5X8';

// Default approval channel this data source powers. Callers can override via ?channelId=.
const DEFAULT_CHANNEL_ID = 'barnhaus-vanessa-sms-drafts';

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

interface PendingDraft {
  id: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
  sender_name: string | null;
}

export async function GET(req: NextRequest) {
  try {
    // Auth guard — must be a logged-in portal user (any org). This route doesn't
    // filter by org (CRM data is currently Barnhaus-only) but requires auth so the
    // CRM service key is never reachable by an unauthenticated caller.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const channelId = req.nextUrl.searchParams.get('channelId') || DEFAULT_CHANNEL_ID;
    // Default window keeps the list to recently-active threads only; without this,
    // every contact with SMS history ever (1500+) renders as a collapsed row and
    // the view becomes an unreadable wall of thin lines. Pass ?days=0 for no limit.
    const daysParam = req.nextUrl.searchParams.get('days');
    const windowDays = daysParam !== null ? Number(daysParam) : 45;
    const sinceIso = windowDays > 0
      ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const crm = createSupabaseClient(CRM_URL, CRM_SERVICE_KEY);

    let activitiesQuery = crm
      .from('activities')
      .select('id, contact_id, activity_type, title, description, created_at')
      .in('activity_type', ['sms_sent', 'sms_received'])
      .order('created_at', { ascending: true })
      .limit(1000);
    if (sinceIso) activitiesQuery = activitiesQuery.gte('created_at', sinceIso);

    const { data: activities, error: actErr } = await activitiesQuery;

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
    const contactByPhone = new Map(contacts.filter(c => c.phone).map(c => [c.phone as string, c]));

    // Pending SMS drafts awaiting approval — from the Portal's own DB, for the requested channel
    const { data: draftMessages } = await supabase
      .from('portal_messages')
      .select('id, content, metadata, created_at, sender_name')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(200);

    const pendingDraftByPhone = new Map<string, PendingDraft>();
    for (const m of draftMessages ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (meta.approval_state === 'pending' && meta.to) {
        const phone = meta.to as string;
        // keep only the most recent pending draft per phone number
        if (!pendingDraftByPhone.has(phone)) {
          pendingDraftByPhone.set(phone, { id: m.id, content: m.content, created_at: m.created_at, metadata: meta, sender_name: m.sender_name ?? null });
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

    interface ThreadOut {
      contact_id: string;
      contact_name: string;
      phone: string | null;
      email: string | null;
      message_count: number;
      last_message: string;
      last_message_type: string | null;
      last_message_at: string | null;
      sort_at: string | null;
      pending_draft: PendingDraft | null;
      messages: { id: string; direction: 'in' | 'out'; text: string; at: string }[];
    }

    const threads: ThreadOut[] = Array.from(threadsByContact.entries()).map(([contactId, msgs]) => {
      const contact = contactMap.get(contactId);
      const last = msgs[msgs.length - 1];
      const phone = contact?.phone ?? null;
      const pendingDraft = phone ? pendingDraftByPhone.get(phone) : undefined;
      if (phone && pendingDraft) pendingDraftByPhone.delete(phone); // mark consumed
      const lastMessageAt = last?.created_at ?? null;
      // Sort key accounts for a fresh pending draft bumping the thread even if newer
      // than the last known CRM activity (e.g. draft generated before it's logged).
      const sortAt = pendingDraft && (!lastMessageAt || pendingDraft.created_at > lastMessageAt)
        ? pendingDraft.created_at
        : lastMessageAt;
      return {
        contact_id: contactId,
        contact_name: contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Unknown' : 'Unknown contact',
        phone,
        email: contact?.email ?? null,
        message_count: msgs.length,
        last_message: last?.description ?? last?.title ?? '',
        last_message_type: last?.activity_type ?? null,
        last_message_at: lastMessageAt,
        sort_at: sortAt,
        pending_draft: pendingDraft ?? null,
        messages: msgs.map(m => ({
          id: m.id,
          direction: m.activity_type === 'sms_sent' ? 'out' : 'in',
          text: m.description ?? m.title ?? '',
          at: m.created_at,
        })),
      };
    });

    // Any remaining pending drafts didn't match an existing CRM-activity thread
    // (e.g. brand-new contact with no logged SMS yet) — surface them as their own
    // thread so nothing awaiting approval is ever hidden.
    for (const [phone, draft] of pendingDraftByPhone.entries()) {
      const contact = contactByPhone.get(phone);
      threads.push({
        contact_id: contact?.id ?? `draft:${phone}`,
        contact_name: contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Unknown' : 'Unknown contact',
        phone,
        email: contact?.email ?? null,
        message_count: 0,
        last_message: draft.content,
        last_message_type: null,
        last_message_at: null,
        sort_at: draft.created_at,
        pending_draft: draft,
        messages: [],
      });
    }

    threads.sort((a, b) => new Date(b.sort_at ?? 0).getTime() - new Date(a.sort_at ?? 0).getTime());

    return NextResponse.json({ threads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
