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
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    // Check if already subscribed
    isPushSubscribed().then((subscribed) => {
      if (subscribed) return;

      if (isIOS() && !isInStandaloneMode()) {
        // On iOS but not installed — show install prompt
        const dismissed = localStorage.getItem('ios-install-dismissed');
        if (!dismissed) setShow('ios');
      } else if (!isIOS()) {
        // Non-iOS — show push permission prompt after short delay
        const dismissed = localStorage.getItem('push-prompt-dismissed');
        if (!dismissed) setTimeout(() => setShow('push'), 3000);
      }
      // iOS + standalone = show push prompt
      else if (isIOS() && isInStandaloneMode()) {
        const dismissed = localStorage.getItem('push-prompt-dismissed');
        if (!dismissed) setTimeout(() => setShow('push'), 3000);
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
    localStorage.setItem('push-prompt-dismissed', '1');
    setShow(null);
  }

  function dismissIOS() {
    localStorage.setItem('ios-install-dismissed', '1');
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
