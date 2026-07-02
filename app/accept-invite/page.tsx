'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

interface InviteData {
  id: string;
  org_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  organizations: { name: string; slug: string; logo_url: string | null };
}

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const supabase = createClient();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'success'>('loading');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    async function loadInvite() {
      const { data, error } = await supabase
        .from('portal_invites')
        .select('*, organizations(name, slug, logo_url)')
        .eq('token', token as string)
        .single();

      if (error || !data) { setStatus('invalid'); return; }
      if (data.accepted_at) { setStatus('used'); return; }
      if (new Date(data.expires_at) < new Date()) { setStatus('expired'); return; }

      setInvite(data as InviteData);
      setStatus('valid');
    }
    loadInvite();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setError('');

    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setSubmitting(true);
    try {
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { data: { name: name.trim() } },
      });

      if (authError) {
        // User might already exist — try signing in instead
        if (authError.message.includes('already registered')) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
          if (signInError) { setError('This email is already registered. Try logging in with your existing password.'); setSubmitting(false); return; }
        } else {
          setError(authError.message);
          setSubmitting(false);
          return;
        }
      }

      const authId = authData?.user?.id ?? (await supabase.auth.getUser()).data.user?.id;
      if (!authId) { setError('Auth failed. Please try again.'); setSubmitting(false); return; }

      // 2. Create portal_users row
      const { error: userError } = await supabase.from('portal_users').insert({
        org_id: invite.org_id,
        supabase_auth_id: authId,
        name: name.trim(),
        email: invite.email,
        role: invite.role,
        active: true,
      });

      if (userError && !userError.message.includes('duplicate')) {
        console.error('User insert error:', userError);
        setError('Account created but failed to set up profile. Contact support.');
        setSubmitting(false);
        return;
      }

      // 3. Mark invite as accepted
      await supabase
        .from('portal_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      setStatus('success');
      // Redirect to their org after a moment
      setTimeout(() => {
        router.push(`/${invite.organizations.slug}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#080c14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '12px',
    padding: '36px',
    width: '100%',
    maxWidth: '400px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: '#080c14',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    color: '#7d8590',
    marginBottom: '6px',
    fontWeight: 500,
  };

  if (status === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#7d8590', fontSize: '14px' }}>Checking invite…</div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>🔗</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e6edf3', marginBottom: '8px' }}>Invalid invite link</div>
          <div style={{ fontSize: '14px', color: '#7d8590' }}>This invite link is invalid or doesn't exist. Ask to be re-invited.</div>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏰</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e6edf3', marginBottom: '8px' }}>Invite expired</div>
          <div style={{ fontSize: '14px', color: '#7d8590' }}>This invite link has expired. Ask your admin to send a new one.</div>
        </div>
      </div>
    );
  }

  if (status === 'used') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e6edf3', marginBottom: '8px' }}>Already accepted</div>
          <div style={{ fontSize: '14px', color: '#7d8590', marginBottom: '20px' }}>This invite has already been used. Try logging in.</div>
          <a href="/login" style={{ display: 'block', textAlign: 'center', padding: '10px', background: '#4c8bf0', borderRadius: '6px', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>🎉</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e6edf3', marginBottom: '8px' }}>You're in!</div>
          <div style={{ fontSize: '14px', color: '#7d8590' }}>Account created. Taking you to the portal…</div>
        </div>
      </div>
    );
  }

  // status === 'valid'
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <Image src="/logo.png" alt="Empower" width={28} height={28} style={{ objectFit: 'contain', borderRadius: '4px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e6edf3' }}>{invite?.organizations.name}</div>
            <div style={{ fontSize: '11px', color: '#7d8590' }}>Agent Portal</div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#e6edf3', marginBottom: '6px' }}>
            Accept your invitation
          </div>
          <div style={{ fontSize: '13px', color: '#7d8590' }}>
            You've been invited to join as <strong style={{ color: '#8fb8f5' }}>{invite?.role}</strong>.
            Set up your account below.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={invite?.email ?? ''}
              disabled
              style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              required
              autoFocus
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: '#da3633', background: 'rgba(218,54,51,0.1)', border: '1px solid rgba(218,54,51,0.3)', borderRadius: '6px', padding: '10px 12px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '11px',
              background: submitting ? '#21262d' : '#4c8bf0',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              marginTop: '4px',
            }}
          >
            {submitting ? 'Setting up your account…' : 'Accept Invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}
