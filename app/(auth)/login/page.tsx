'use client';

import { useState } from 'react';
import Image from 'next/image';
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#080c14' }}>
      <div className="w-full max-w-sm">
        {/* Logo + Title */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Empower Building AI"
              width={56}
              height={56}
              className="object-contain"
            />
          </div>
          <div className="text-2xl font-bold text-white">Empower Building AI</div>
          <div className="text-sm mt-1" style={{ color: '#7d8590' }}>Agent Portal</div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{
              background: '#0d1117',
              border: '1px solid #1e2733',
              color: '#e6edf3',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{
              background: '#0d1117',
              border: '1px solid #1e2733',
              color: '#e6edf3',
            }}
          />

          {error && (
            <div className="text-sm text-red-400 px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-all mt-2"
            style={{
              background: loading ? '#7a5a07' : '#C49A0F',
              color: '#fff',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
