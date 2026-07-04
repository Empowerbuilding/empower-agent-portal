'use client';

import { useEffect, useState } from 'react';
import { subscribeToPush, isIOS, isInStandaloneMode, isPushSubscribed } from '@/lib/push';

interface Props {
  userId: string;
}

export default function NotificationPrompt({ userId }: Props) {
  const [show, setShow] = useState<'push' | 'ios' | null>(null);

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
    const ok = await subscribeToPush(userId);
    if (ok) {
      setShow(null);
    } else {
      // Permission denied — dismiss silently
      localStorage.setItem('push-prompt-dismissed', '1');
      setShow(null);
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
      <button className="notif-prompt-enable" onClick={handleEnablePush}>Enable</button>
      <button className="notif-prompt-dismiss" onClick={dismissPush}>✕</button>
    </div>
  );
}
