self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const { title, body, channelUrl, channelId } = data;

  event.waitUntil(
    self.registration.showNotification(title || 'New message', {
      body: body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: channelId || 'portal',
      renotify: true,
      data: { channelUrl },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.channelUrl || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
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
