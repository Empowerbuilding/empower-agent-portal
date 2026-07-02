import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, role, orgId } = await req.json();
    if (!email || !orgId) return NextResponse.json({ error: 'Missing email or orgId' }, { status: 400 });

    const validRoles = ['owner', 'admin', 'rep'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Get the portal user making the request
    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id, role, org_id')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!portalUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    if (!['owner', 'admin'].includes(portalUser.role)) {
      return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 });
    }

    // Get org name for email
    const { data: org } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', orgId)
      .single();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    // Check if already a member
    const { data: existing } = await supabase
      .from('portal_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', email.toLowerCase().trim())
      .single();
    if (existing) return NextResponse.json({ error: 'This email is already a member' }, { status: 409 });

    // Check for existing pending invite
    const { data: pendingInvite } = await supabase
      .from('portal_invites')
      .select('id, expires_at')
      .eq('org_id', orgId)
      .eq('email', email.toLowerCase().trim())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (pendingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for this email' }, { status: 409 });
    }

    // Create the invite
    const { data: invite, error: insertError } = await supabase
      .from('portal_invites')
      .insert({
        org_id: orgId,
        email: email.toLowerCase().trim(),
        role: role || 'rep',
        invited_by: portalUser.id,
      })
      .select()
      .single();

    if (insertError || !invite) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Send invite email via Tony webhook
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.empowerbuilding.ai'}/accept-invite?token=${invite.token}`;

    const emailBody = `You've been invited to join **${org.name}** on the Empower Agent Portal.

Click the link below to accept your invitation and set up your account:

👉 ${inviteUrl}

This link expires in 7 days. If you didn't expect this invitation, you can safely ignore it.`;

    const emailRes = await fetch('https://n8n.empowerbuilding.ai/webhook/tony-send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: `You've been invited to ${org.name} — Empower Portal`,
        body: emailBody,
        from_addr: 'mitchell@empowerbuilding.ai',
      }),
    });

    const emailData = await emailRes.json();
    if (!emailData.success) {
      console.error('Email failed:', emailData);
      // Don't fail the whole request — invite is created, just note the email issue
      return NextResponse.json({ success: true, inviteId: invite.id, emailSent: false });
    }

    return NextResponse.json({ success: true, inviteId: invite.id, emailSent: true });
  } catch (err: any) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — list pending invites for an org
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = req.nextUrl.searchParams.get('orgId');
    if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', orgId)
      .single();
    if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: invites } = await supabase
      .from('portal_invites')
      .select('id, email, role, accepted_at, expires_at, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    return NextResponse.json(invites ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — revoke a pending invite
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { inviteId, orgId } = await req.json();
    if (!inviteId || !orgId) return NextResponse.json({ error: 'Missing inviteId or orgId' }, { status: 400 });

    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', orgId)
      .single();
    if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await supabase.from('portal_invites').delete().eq('id', inviteId).eq('org_id', orgId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
