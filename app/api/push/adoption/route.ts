import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Notification adoption report for an org — owner/admin only.
 * GET /api/push/adoption?orgId=...
 * Returns each member's device count + last delivery outcome so admins can
 * see exactly who is (and isn't) getting notifications.
 */
export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get('orgId');
    if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Requester must be owner/admin of this org
    const { data: requester } = await admin
      .from('portal_users')
      .select('id, role')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', orgId)
      .single();
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: members } = await admin
      .from('portal_users')
      .select('id, name, email, role, last_active_at')
      .eq('org_id', orgId);
    if (!members) return NextResponse.json({ members: [] });

    const ids = members.map((m: any) => m.id);

    const [{ data: subs }, { data: recentLogs }] = await Promise.all([
      admin.from('push_subscriptions').select('user_id, created_at').in('user_id', ids),
      admin
        .from('push_send_log')
        .select('user_id, status, error, created_at')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const report = members.map((m: any) => {
      const mySubs = (subs ?? []).filter((s: any) => s.user_id === m.id);
      const myLogs = (recentLogs ?? []).filter((l: any) => l.user_id === m.id);
      const lastLog = myLogs[0] ?? null;
      const failures7d = myLogs.filter(
        (l: any) => l.status !== 'sent' && Date.now() - new Date(l.created_at).getTime() < 7 * 24 * 3600 * 1000
      ).length;
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        devices: mySubs.length,
        lastSubscribed: mySubs.length ? mySubs.map((s: any) => s.created_at).sort().pop() : null,
        lastSend: lastLog ? { status: lastLog.status, at: lastLog.created_at, error: lastLog.error } : null,
        failures7d,
      };
    });

    // Unsubscribed users first — they're the action items
    report.sort((a: any, b: any) => a.devices - b.devices || a.name.localeCompare(b.name));

    return NextResponse.json({ members: report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
