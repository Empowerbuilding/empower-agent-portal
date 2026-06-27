'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white mb-1">Agent Portal</div>
          <div className="text-sm" style={{ color: '#888' }}>Empower Building</div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none focus:ring-1"
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#f0f0f0',
              }}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg text-sm outline-none focus:ring-1"
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#f0f0f0',
              }}
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity"
            style={{
              background: '#B8860B',
              color: '#fff',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
