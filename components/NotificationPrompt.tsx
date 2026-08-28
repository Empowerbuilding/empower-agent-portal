'use client';

import { useEffect, useState } from 'react';
import {
  requestNotificationPermission,
  subscribeToPush,
  isIOS,
  isInAppBrowser,
  isInStandaloneMode,
  isPushSubscribed,
} from '@/lib/push';
import PushSetupPanel from '@/components/push/PushSetupPanel';

interface Props {
  userId: string;
  agentName?: string;
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Push onboarding:
 * - Mobile, not subscribed → full-screen setup interstitial (once per session).
 *   Handles every case: in-app webview escape, iOS install steps, Android enable.
 * - Desktop, not subscribed → small dismissible banner (3-day re-show).
 *
 * NOTE: iOS Safari does NOT expose the Notification API until the site is
 * installed to the home screen — so "no Notification API" on iOS/webview is the
 * install-needed case, not the unsupported case.
 */
export default function NotificationPrompt({ userId, agentName }: Props) {
  const [show, setShow] = useState<'interstitial' | 'banner' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasNotifApi = 'Notification' in window;
    if (hasNotifApi && Notification.permission === 'denied') return;

    const decide = async () => {
      // Already subscribed on this device? Nothing to do.
      if (hasNotifApi && 'serviceWorker' in navigator) {
        const subscribed = await isPushSubscribed().catch(() => false);
        if (subscribed) return;
        if (Notification.permission === 'granted') return; // resync in OrgShell will self-heal
      } else if (!isIOS() && !isInAppBrowser()) {
        return; // genuinely unsupported browser — don't nag
      }

      if (isMobileViewport()) {
        // Full-screen interstitial — once per session so it reappears each login/visit
        if (sessionStorage.getItem('push-interstitial-dismissed') === '1') return;
        setTimeout(() => setShow('interstitial'), 1200);
      } else {
        // Desktop banner — 3-day re-show after dismiss
        const dismissed = localStorage.getItem('push-prompt-dismissed');
        const dismissedAt = dismissed ? parseInt(dismissed) : 0;
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (!dismissed || Date.now() - dismissedAt > threeDays) {
          setTimeout(() => setShow('banner'), 2000);
        }
      }
    };
    decide();
  }, []);

  async function handleEnableBanner() {
    setError(null);
    setLoading(true);
    // Permission request FIRST — before any awaits (Chrome gesture rule)
    const granted = await requestNotificationPermission();
    if (!granted) {
      setLoading(false);
      if (Notification.permission === 'denied') {
        setError('Blocked in browser settings. Go to Site Settings to allow.');
      } else {
        setError('Permission not granted — tap Enable to try again.');
      }
      return;
    }
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.ok) setShow(null);
    else setError(result.error ?? 'Failed to subscribe.');
  }

  function dismissInterstitial() {
    sessionStorage.setItem('push-interstitial-dismissed', '1');
    setShow(null);
  }

  function dismissBanner() {
    localStorage.setItem('push-prompt-dismissed', String(Date.now()));
    setShow(null);
  }

  if (!show) return null;

  if (show === 'interstitial') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'var(--bg, #080c14)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        overflowY: 'auto', padding: '28px 16px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text, #e6edf3)' }}>🔔 Don&apos;t miss a message</h2>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.5 }}>
              Get an alert on this phone when {agentName ?? 'your agent'} replies or a lead comes in — takes under a minute to set up.
            </p>
          </div>
          <PushSetupPanel userId={userId} compact onEnabled={() => {
            // Leave the panel visible so they can fire the test notification;
            // mark session-dismissed so it won't reappear.
            sessionStorage.setItem('push-interstitial-dismissed', '1');
          }} />
          <button
            onClick={dismissInterstitial}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary, #8b949e)',
              fontSize: '14px', padding: '12px', cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  // Desktop banner
  return (
    <div className="notif-prompt">
      <div className="notif-prompt-icon">🔔</div>
      <div className="notif-prompt-text">
        <strong>Enable notifications</strong>
        <span>Get alerted when {agentName ?? 'your agent'} replies</span>
      </div>
      {error && <span style={{ fontSize: '11px', color: '#f85149', maxWidth: '180px' }}>{error}</span>}
      <button className="notif-prompt-enable" onClick={handleEnableBanner} disabled={loading}>
        {loading ? '…' : 'Enable'}
      </button>
      <button className="notif-prompt-dismiss" onClick={dismissBanner}>✕</button>
    </div>
  );
}
