'use client';

import { useState, useEffect, Suspense } from 'react';
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
  token: string;
  channel_ids: string[] | null;
  organizations: { name: string; slug: string; logo_url: string | null } | null;
}

function AcceptInviteContent() {
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
      // Server-side lookup (service role) — anon RLS blocks the organizations join,
      // which used to crash this page with a null org.
      let data: InviteData | null = null;
      try {
        const res = await fetch(`/api/accept-invite?token=${encodeURIComponent(token as string)}`);
        if (res.ok) {
          const json = await res.json();
          data = json.invite ?? null;
        }
      } catch { /* fall through to invalid */ }

      if (!data) { setStatus('invalid'); return; }
      if (data.accepted_at) { setStatus('used'); return; }
      if (new Date(data.expires_at) < new Date()) { setStatus('expired'); return; }

      setInvite(data);
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

      // 2. Create portal_users row + assign channels + delete invite — all server-side
      // (service role — bypasses RLS; a brand-new user has no org membership yet,
      // so a client-side insert into portal_users is always blocked by user_isolation RLS)
      const res = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invite.token, authId, name: name.trim() }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        console.error('Accept-invite setup error:', result);
        setError('Account created but failed to set up profile. Contact support.');
        setSubmitting(false);
        return;
      }

      setStatus('success');
      // Redirect to their org after a moment
      setTimeout(() => {
        router.push(invite.organizations?.slug ? `/${invite.organizations.slug}` : '/');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '36px',
    width: '100%',
    maxWidth: '400px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text)',
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
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Invalid invite link</div>
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
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Invite expired</div>
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
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Already accepted</div>
          <div style={{ fontSize: '14px', color: '#7d8590', marginBottom: '20px' }}>This invite has already been used. Try logging in.</div>
          <a href="/login" style={{ display: 'block', textAlign: 'center', padding: '10px', background: 'var(--accent)', borderRadius: '6px', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
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
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>You're in!</div>
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
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{invite?.organizations?.name ?? 'Empower Portal'}</div>
            <div style={{ fontSize: '11px', color: '#7d8590' }}>Agent Portal</div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
            Accept your invitation
          </div>
          <div style={{ fontSize: '13px', color: '#7d8590' }}>
            You've been invited to join as <strong style={{ color: 'var(--accent)' }}>{invite?.role}</strong>.
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
              background: submitting ? 'var(--border)' : 'var(--accent)',
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

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#7d8590', fontSize: '14px' }}>Loading…</div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
