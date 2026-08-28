'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isIOS,
  isAndroid,
  isInAppBrowser,
  isInStandaloneMode,
  requestNotificationPermission,
  subscribeToPush,
  checkServerSubscription,
  registerServiceWorker,
} from '@/lib/push';

type Platform = 'webview' | 'ios-browser' | 'ios-standalone' | 'android' | 'desktop' | 'unsupported';

interface Checks {
  permission: 'granted' | 'denied' | 'default' | 'unsupported';
  swRegistered: boolean;
  hasSubscription: boolean;
  onServer: boolean | null;
}

interface Props {
  userId: string;
  /** Compact mode hides the header (used inside the interstitial which has its own). */
  compact?: boolean;
  /** Called after a successful subscribe + verified test-capable state. */
  onEnabled?: () => void;
}

const S = {
  panel: {
    display: 'flex', flexDirection: 'column' as const, gap: '14px',
    maxWidth: '440px', width: '100%',
  },
  card: {
    background: 'var(--bg-secondary, #0d1420)', border: '1px solid var(--border, #1e2939)',
    borderRadius: '12px', padding: '16px',
  },
  stepNum: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
    background: '#1f6feb', color: '#fff', fontSize: '12px', fontWeight: 700 as const,
  },
  stepRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', lineHeight: 1.45 },
  check: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' },
  btnPrimary: {
    background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '12px 18px', fontSize: '15px', fontWeight: 600 as const, cursor: 'pointer', width: '100%',
  },
  btnSecondary: {
    background: 'transparent', color: 'var(--text, #e6edf3)', border: '1px solid var(--border, #2d3a4e)',
    borderRadius: '8px', padding: '11px 18px', fontSize: '14px', cursor: 'pointer', width: '100%',
  },
  ok: { color: '#3fb950' },
  bad: { color: '#f85149' },
  dim: { color: 'var(--text-secondary, #8b949e)' },
};

function Dot({ good }: { good: boolean | null }) {
  return <span style={good === null ? S.dim : good ? S.ok : S.bad}>{good === null ? '…' : good ? '✓' : '✗'}</span>;
}

export default function PushSetupPanel({ userId, compact, onEnabled }: Props) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [testDetail, setTestDetail] = useState('');
  const [copied, setCopied] = useState(false);

  const refreshChecks = useCallback(async () => {
    const c: Checks = {
      permission: typeof Notification !== 'undefined' ? (Notification.permission as Checks['permission']) : 'unsupported',
      swRegistered: false,
      hasSubscription: false,
      onServer: null,
    };
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
      c.swRegistered = !!reg;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      c.hasSubscription = !!sub;
      if (sub) {
        const server = await checkServerSubscription(userId);
        c.onServer = server ? server.onServer : null;
      }
    } catch {}
    setChecks(c);
    return c;
  }, [userId]);

  useEffect(() => {
    // Platform detection
    if (typeof window === 'undefined') return;
    let p: Platform;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      // iOS Safari (not installed) reports no Notification API — that's the install case, not unsupported
      if (isInAppBrowser()) p = 'webview';
      else if (isIOS() && !isInStandaloneMode()) p = 'ios-browser';
      else p = 'unsupported';
    } else if (isInAppBrowser()) {
      p = 'webview';
    } else if (isIOS()) {
      p = isInStandaloneMode() ? 'ios-standalone' : 'ios-browser';
    } else if (isAndroid()) {
      p = 'android';
    } else {
      p = 'desktop';
    }
    setPlatform(p);
    registerServiceWorker().finally(() => { refreshChecks(); });

    // Re-check when tab regains focus (user comes back from browser settings)
    const onVis = () => { if (document.visibilityState === 'visible') refreshChecks(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshChecks]);

  async function handleEnable() {
    setError(null);
    setBusy(true);
    // Permission request must be first — no awaits before it (Chrome gesture rule)
    const granted = await requestNotificationPermission();
    if (!granted) {
      setBusy(false);
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setError(isIOS()
          ? 'Notifications are blocked. Open iPhone Settings → Notifications → Agent Portal → Allow Notifications, then come back.'
          : 'Notifications are blocked for this site. Tap the lock icon in the address bar → Permissions → Notifications → Allow, then try again.');
      } else {
        setError('Permission wasn\u2019t granted — tap Enable and choose Allow.');
      }
      refreshChecks();
      return;
    }
    const result = await subscribeToPush(userId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to subscribe. Try again.');
    } else {
      onEnabled?.();
    }
    refreshChecks();
  }

  async function handleTest() {
    setTestState('sending');
    setTestDetail('');
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.sent > 0) {
        setTestState('sent');
        setTestDetail(`Sent to ${data.sent} device${data.sent === 1 ? '' : 's'} — check your notification shade.`);
      } else {
        setTestState('failed');
        setTestDetail(data.error || (data.expired ? 'Your subscription expired — tap Enable again.' : 'No devices received it.'));
      }
    } catch {
      setTestState('failed');
      setTestDetail('Network error — try again.');
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/notifications`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback for webviews without clipboard API
      prompt('Copy this link:', url);
    });
  }

  if (!platform) return null;

  const enabled = checks?.permission === 'granted' && checks?.hasSubscription && checks?.onServer !== false;

  // ───────────────────────────── In-app webview: dead end, escape first ─────────────────────────────
  if (platform === 'webview') {
    return (
      <div style={S.panel}>
        {!compact && <h2 style={{ margin: 0, fontSize: '18px' }}>🔔 Get notified on this phone</h2>}
        <div style={S.card}>
          <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
            <strong>You&apos;re inside an app&apos;s built-in browser</strong> (Messages, Gmail, Facebook, etc.).
            Notifications can&apos;t be enabled here — you need to open the portal in your real browser first.
          </div>
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={S.stepRow}><span style={S.stepNum}>1</span><span>Tap the button below to copy the link</span></div>
            <div style={S.stepRow}><span style={S.stepNum}>2</span><span>Open <strong>{isIOS() ? 'Safari' : 'Chrome'}</strong> and paste it in the address bar</span></div>
            <div style={S.stepRow}><span style={S.stepNum}>3</span><span>Follow the steps shown there</span></div>
          </div>
          <button style={{ ...S.btnPrimary, marginTop: '14px' }} onClick={copyLink}>
            {copied ? '✓ Link copied' : 'Copy portal link'}
          </button>
          <div style={{ ...S.dim, fontSize: '12px', marginTop: '10px' }}>
            Tip: many apps have an <strong>&quot;Open in Browser&quot;</strong> option in the ⋯ / share menu — that works too.
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────── iOS in Safari (not installed): must install ─────────────────────────────
  if (platform === 'ios-browser') {
    return (
      <div style={S.panel}>
        {!compact && <h2 style={{ margin: 0, fontSize: '18px' }}>🔔 Get notified on this iPhone</h2>}
        <div style={S.card}>
          <div style={{ fontSize: '14px', lineHeight: 1.5, marginBottom: '14px' }}>
            iPhones only allow notifications from <strong>installed</strong> web apps — this is an Apple rule.
            Install takes 10 seconds:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={S.stepRow}><span style={S.stepNum}>1</span><span>Tap the <strong>Share</strong> button <span style={S.dim}>(square with arrow ↑, bottom of Safari)</span></span></div>
            <div style={S.stepRow}><span style={S.stepNum}>2</span><span>Scroll down, tap <strong>Add to Home Screen</strong>, then <strong>Add</strong></span></div>
            <div style={S.stepRow}><span style={S.stepNum}>3</span><span>Open the new <strong>Agent Portal</strong> icon on your home screen</span></div>
            <div style={S.stepRow}><span style={S.stepNum}>4</span><span>Come back to this page from the app and tap <strong>Enable</strong></span></div>
          </div>
          <div style={{ ...S.dim, fontSize: '12px', marginTop: '14px' }}>
            ⚠️ If you&apos;re not in Safari, notifications won&apos;t work — copy the link and open it in Safari first.
          </div>
        </div>
      </div>
    );
  }

  if (platform === 'unsupported') {
    return (
      <div style={S.panel}>
        <div style={S.card}>
          <div style={{ fontSize: '14px' }}>
            This browser doesn&apos;t support push notifications. On iPhone use <strong>Safari</strong>; on Android use <strong>Chrome</strong>.
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────── iOS standalone / Android / desktop: can enable ─────────────────────────────
  return (
    <div style={S.panel}>
      {!compact && <h2 style={{ margin: 0, fontSize: '18px' }}>🔔 Notifications on this device</h2>}

      {/* Live status checks */}
      <div style={S.card}>
        <div style={S.check}><span>Notification permission</span><Dot good={checks ? checks.permission === 'granted' : null} /></div>
        <div style={S.check}><span>Service worker</span><Dot good={checks ? checks.swRegistered : null} /></div>
        <div style={S.check}><span>Device subscribed</span><Dot good={checks ? checks.hasSubscription : null} /></div>
        <div style={S.check}><span>Registered with server</span><Dot good={checks ? (checks.hasSubscription ? checks.onServer : false) : null} /></div>
      </div>

      {checks?.permission === 'denied' && (
        <div style={{ ...S.card, borderColor: '#f85149' }}>
          <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
            <strong style={S.bad}>Notifications are blocked.</strong><br />
            {platform === 'ios-standalone'
              ? <>iPhone Settings → <strong>Notifications</strong> → <strong>Agent Portal</strong> → <strong>Allow Notifications</strong>, then return here.</>
              : <>Tap the <strong>lock / tune icon</strong> in the address bar → <strong>Permissions</strong> → <strong>Notifications</strong> → <strong>Allow</strong>, then reload.</>}
          </div>
        </div>
      )}

      {!enabled && checks?.permission !== 'denied' && (
        <button style={S.btnPrimary} onClick={handleEnable} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
      )}

      {error && <div style={{ ...S.bad, fontSize: '13px', lineHeight: 1.4 }}>{error}</div>}

      {enabled && (
        <>
          <div style={{ ...S.ok, fontSize: '14px', fontWeight: 600 }}>✓ Notifications are enabled on this device</div>
          <button style={S.btnSecondary} onClick={handleTest} disabled={testState === 'sending'}>
            {testState === 'sending' ? 'Sending…' : 'Send a test notification'}
          </button>
          {testState === 'sent' && <div style={{ ...S.ok, fontSize: '13px' }}>✓ {testDetail}</div>}
          {testState === 'failed' && <div style={{ ...S.bad, fontSize: '13px' }}>{testDetail}</div>}
          {platform === 'android' && (
            <div style={{ ...S.dim, fontSize: '12px', lineHeight: 1.5 }}>
              Notifications delayed or missing? Phone Settings → Apps → {isInStandaloneMode() ? 'Agent Portal' : 'Chrome'} → Battery
              → <strong>Unrestricted</strong>. Samsung: also remove it from &quot;Deep sleeping apps.&quot;
            </div>
          )}
          {platform === 'ios-standalone' && (
            <div style={{ ...S.dim, fontSize: '12px', lineHeight: 1.5 }}>
              Keep the Agent Portal icon on your home screen — deleting it turns notifications off.
            </div>
          )}
        </>
      )}

      {platform === 'android' && !enabled && !isInStandaloneMode() && (
        <div style={{ ...S.dim, fontSize: '12px', lineHeight: 1.5 }}>
          Recommended: Chrome menu (⋮) → <strong>Add to Home screen</strong> → <strong>Install</strong> for the most reliable delivery.
        </div>
      )}
    </div>
  );
}
