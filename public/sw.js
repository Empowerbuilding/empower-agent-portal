// Running badge count stored in IDB-like cache via SW scope variable
let _badgeCount = 0;

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const { title, body, channelUrl, channelId } = data;

  _badgeCount += 1;
  const count = _badgeCount;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title || 'New message', {
        body: body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: channelId || 'portal',
        renotify: true,
        data: { channelUrl },
      }),
      navigator.setAppBadge ? navigator.setAppBadge(count) : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.channelUrl || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Clear badge when user taps notification
      if (navigator.clearAppBadge) navigator.clearAppBadge();
      // If portal already open, focus and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Browser rotated or expired the push subscription (Chrome Android does this
// after updates/battery optimization). Re-subscribe immediately and re-register
// with the server — works even when no portal tab is open.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const ctx = await new Promise((resolve) => {
        const open = indexedDB.open('portal-push', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('ctx');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const tx = open.result.transaction('ctx', 'readonly');
          const get = tx.objectStore('ctx').get('push-ctx');
          get.onsuccess = () => { open.result.close(); resolve(get.result || null); };
          get.onerror = () => { open.result.close(); resolve(null); };
        };
      });
      if (!ctx || !ctx.userId || !ctx.vapidKey) return;

      const padding = '='.repeat((4 - (ctx.vapidKey.length % 4)) % 4);
      const b64 = (ctx.vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(b64);
      const appServerKey = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));

      const newSub = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: newSub.toJSON(), userId: ctx.userId }),
      });

      // Remove the dead endpoint's server row if we know it
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      if (oldEndpoint && oldEndpoint !== newSub.endpoint) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: oldEndpoint, userId: ctx.userId }),
        }).catch(() => {});
      }
    } catch (e) {
      // Best effort — page-level resync will retry on next app open
    }
  })());
});

// Clear badge when any portal client becomes visible (replaces dead 'focus' on SW scope)
self.addEventListener('message', (event) => {
  if (event.data === 'clear-badge') {
    _badgeCount = 0;
    if (navigator.clearAppBadge) navigator.clearAppBadge();
  }
});
