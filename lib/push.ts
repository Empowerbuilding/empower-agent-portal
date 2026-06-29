const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('[push] SW registration failed:', e);
    return null;
  }
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    const reg = await registerServiceWorker();
    if (!reg) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userId }),
    });

    return res.ok;
  } catch (e) {
    console.error('[push] subscribe failed:', e);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, userId }),
  });
  await sub.unsubscribe();
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return ('standalone' in window.navigator && (window.navigator as any).standalone === true)
    || window.matchMedia('(display-mode: standalone)').matches;
}

export async function isPushSubscribed(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
