'use client';

import { useEffect, useState } from 'react';
import { requestNotificationPermission, subscribeToPush, isIOS, isInStandaloneMode, isPushSubscribed } from '@/lib/push';

interface Props {
  userId: string;
}

export default function NotificationPrompt({ userId }: Props) {
  const [show, setShow] = useState<'push' | 'ios' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    isPushSubscribed().then((subscribed) => {
      if (subscribed) return;
      if (Notification.permission === 'granted') return;

      if (isIOS() && !isInStandaloneMode()) {
        // iOS not installed yet — show install prompt (re-show after 7 days even if dismissed)
        const dismissed = localStorage.getItem('ios-install-dismissed');
        const dismissedAt = dismissed ? parseInt(dismissed) : 0;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (!dismissed || Date.now() - dismissedAt > sevenDays) setTimeout(() => setShow('ios'), 2000);
      } else {
        // Non-iOS or iOS standalone — show push prompt (re-show after 3 days)
        const dismissed = localStorage.getItem('push-prompt-dismissed');
        const dismissedAt = dismissed ? parseInt(dismissed) : 0;
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (!dismissed || Date.now() - dismissedAt > threeDays) setTimeout(() => setShow('push'), 2000);
      }
    });
  }, []);

  async function handleEnablePush() {
    setError(null);
    setLoading(true);

    // Request permission FIRST — must happen before any awaits so Chrome
    // on Android recognizes it as a direct user gesture response.
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

    // Permission granted — now set up the push subscription
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.ok) {
      setShow(null);
    } else {
      setError(result.error ?? 'Failed to subscribe.');
    }
  }

  function dismissPush() {
    localStorage.setItem('push-prompt-dismissed', String(Date.now()));
    setShow(null);
  }

  function dismissIOS() {
    localStorage.setItem('ios-install-dismissed', String(Date.now()));
    setShow(null);
  }

  if (!show) return null;

  if (show === 'ios') {
    return (
      <div className="notif-prompt">
        <div className="notif-prompt-icon">📲</div>
        <div className="notif-prompt-text">
          <strong>Install for notifications</strong>
          <span>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> in Safari to get message alerts</span>
        </div>
        <button className="notif-prompt-dismiss" onClick={dismissIOS}>✕</button>
      </div>
    );
  }

  return (
    <div className="notif-prompt">
      <div className="notif-prompt-icon">🔔</div>
      <div className="notif-prompt-text">
        <strong>Enable notifications</strong>
        <span>Get alerted when Vanessa replies</span>
      </div>
      {error && <span style={{ fontSize: '11px', color: '#f85149', maxWidth: '180px' }}>{error}</span>}
      <button className="notif-prompt-enable" onClick={handleEnablePush} disabled={loading}>
        {loading ? '…' : 'Enable'}
      </button>
      <button className="notif-prompt-dismiss" onClick={dismissPush}>✕</button>
    </div>
  );
}
