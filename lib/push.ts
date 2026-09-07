const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

/** Persistent client-side event log for diagnosing push state changes. */
export function logPushEvent(action: string, detail?: string): void {
  try {
    if (typeof window === 'undefined') return;
    const log = JSON.parse(localStorage.getItem('push-event-log') || '[]');
    log.push({ t: new Date().toISOString(), action, ...(detail ? { detail } : {}) });
    while (log.length > 30) log.shift();
    localStorage.setItem('push-event-log', JSON.stringify(log));
  } catch {}
}

export function getPushEventLog(): { t: string; action: string; detail?: string }[] {
  try {
    return JSON.parse(localStorage.getItem('push-event-log') || '[]');
  } catch {
    return [];
  }
}

/** Compare a live subscription's applicationServerKey to our VAPID public key. */
function subscriptionMatchesKey(sub: PushSubscription, vapidKey: string): boolean {
  try {
    const raw = (sub.options as any)?.applicationServerKey as ArrayBuffer | null;
    if (!raw) return true; // can't tell — assume ok
    const a = new Uint8Array(raw);
    const b = urlBase64ToUint8Array(vapidKey);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  } catch {
    return true;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Persist { userId, vapidKey } in IndexedDB so the service worker can
 * re-subscribe on its own during a `pushsubscriptionchange` event
 * (fires when the browser rotates/expires the subscription while the
 * app is closed — the SW has no access to localStorage or React state).
 */
async function savePushContextForSW(userId: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('portal-push', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('ctx');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('ctx', 'readwrite');
        tx.objectStore('ctx').put({ userId, vapidKey: VAPID_PUBLIC_KEY }, 'push-ctx');
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => { open.result.close(); reject(tx.error); };
      };
    });
  } catch (e) {
    console.warn('[push] failed to save SW push context:', e);
  }
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

/**
 * Request notification permission — must be called directly from a user gesture,
 * before any async awaits, otherwise Chrome on Android blocks the dialog silently.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Subscribe to push — call AFTER permission is already granted.
 * Registers service worker, creates push subscription, saves to DB.
 */
export async function subscribeToPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (Notification.permission !== 'granted') {
      return { ok: false, error: 'Permission not granted' };
    }

    // Ensure service worker is ready
    const reg = await registerServiceWorker();
    if (!reg) return { ok: false, error: 'Service worker failed to register' };

    // Wait for SW to be active
    await navigator.serviceWorker.ready;

    // A pre-existing subscription created with a DIFFERENT VAPID key makes
    // subscribe() throw InvalidStateError. Detect and clear the stale one first.
    const existing = await reg.pushManager.getSubscription();
    if (existing && !subscriptionMatchesKey(existing, VAPID_PUBLIC_KEY)) {
      console.warn('[push] stale subscription with old VAPID key — unsubscribing');
      logPushEvent('subscribe-stale-key-unsub', existing.endpoint.slice(-12));
      try { await existing.unsubscribe(); } catch {}
    }

    let sub: PushSubscription;
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });
    } catch (subErr: any) {
      // Last-resort recovery: nuke any existing subscription and retry once
      logPushEvent('subscribe-retry', subErr?.name || String(subErr).slice(0, 60));
      const cur = await reg.pushManager.getSubscription();
      if (cur) { try { await cur.unsubscribe(); } catch {} }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userId }),
    });

    if (!res.ok) {
      logPushEvent('subscribe-server-error', String(res.status));
      return { ok: false, error: `Server error: ${res.status}` };
    }
    logPushEvent('subscribe-ok', sub.endpoint.slice(-12));
    // Remember user intent so we can silently re-subscribe if the browser
    // drops the subscription later (Chrome Android does this periodically).
    try { localStorage.setItem('push-enabled', '1'); } catch {}
    await savePushContextForSW(userId);
    return { ok: true };
  } catch (e: any) {
    console.error('[push] subscribe failed:', e);
    logPushEvent('subscribe-FAILED', e?.message?.slice(0, 80) ?? 'unknown');
    return { ok: false, error: e?.message ?? 'Unknown error' };
  }
}

/** Minimum interval between full resync checks (network round-trip involved). */
const RESYNC_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function markResynced(): void {
  try { localStorage.setItem('push-last-resync', String(Date.now())); } catch {}
}

/**
 * Re-sync / self-heal the browser push subscription. Handles every known
 * silent-death mode:
 *  1. Browser dropped the subscription but user intent flag is set → re-subscribe.
 *  2. Subscription made with an old VAPID key → replace with fresh one.
 *  3. Server pruned this endpoint (push service returned 410 Gone on a send,
 *     e.g. FCM token rotation) while the browser still holds the DEAD
 *     subscription → blind re-upload would resume the 410 loop, so we
 *     unsubscribe and mint a completely fresh subscription instead.
 *  4. Server rows wiped while browser subscription is alive → re-upload.
 * Idempotent; debounced to once per hour (localStorage timestamp) so it can
 * safely run on every app-open AND every visibilitychange resume.
 */
export async function resyncPushSubscription(userId: string, opts?: { force?: boolean }): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'granted') return;
    if (!opts?.force) {
      const last = parseInt(localStorage.getItem('push-last-resync') || '0', 10) || 0;
      if (Date.now() - last < RESYNC_MIN_INTERVAL_MS) return;
    }
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Self-heal: user previously enabled push (intent flag) and permission is
      // still granted, but the browser dropped the subscription. Re-subscribe
      // silently — no prompt is shown since permission persists.
      if (localStorage.getItem('push-enabled') === '1') {
        logPushEvent('auto-resubscribe', 'browser dropped subscription');
        const r = await subscribeToPush(userId);
        if (r.ok) {
          markResynced();
        } else {
          logPushEvent('auto-resubscribe-FAILED', r.error?.slice(0, 80));
        }
      }
      return;
    }
    // Don't re-sync a subscription made with an old VAPID key — pushes to it
    // would fail signature checks. Replace it with a fresh one instead.
    if (!subscriptionMatchesKey(sub, VAPID_PUBLIC_KEY)) {
      console.warn('[push] resync found stale-key subscription — replacing');
      logPushEvent('resync-stale-key-replace', sub.endpoint.slice(-12));
      try { await sub.unsubscribe(); } catch {}
      const r = await subscribeToPush(userId);
      if (r.ok) {
        markResynced();
      } else {
        // We just destroyed the old subscription and could not create a new one —
        // this is the silent "toggle reverted" scenario. Log it loudly.
        logPushEvent('resync-replace-FAILED', r.error?.slice(0, 80));
        console.error('[push] resync replace FAILED — subscription lost:', r.error);
      }
      return;
    }

    // Ask the server whether it still has a row for THIS endpoint. If the
    // server pruned it (a send hit 410 Gone — the push service killed the
    // token), this browser-side subscription is dead: re-uploading it would
    // just resume the 410→prune loop. Mint a fresh subscription instead.
    try {
      const statusRes = await fetch('/api/push/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, endpoint: sub.endpoint }),
      });
      if (statusRes.ok) {
        const { onServer } = await statusRes.json();
        if (!onServer) {
          logPushEvent('resync-endpoint-pruned-refresh', sub.endpoint.slice(-12));
          try { await sub.unsubscribe(); } catch {}
          const r = await subscribeToPush(userId);
          if (r.ok) {
            markResynced();
          } else {
            logPushEvent('resync-refresh-FAILED', r.error?.slice(0, 80));
            console.error('[push] pruned-endpoint refresh FAILED:', r.error);
          }
          return;
        }
        // Healthy: on server + key matches. Touch intent flag + SW context
        // (backfills devices subscribed before self-heal existed) and finish.
        try { localStorage.setItem('push-enabled', '1'); } catch {}
        await savePushContextForSW(userId);
        markResynced();
        return;
      }
    } catch {}

    // Status check unavailable (offline / server error) — fall back to the
    // legacy idempotent re-upload so cascade-wipe recovery still works.
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userId }),
    });
    if (res.ok) markResynced();
    // Backfill intent flag + SW context for devices subscribed before this
    // feature existed — gives them self-heal without re-toggling.
    try { localStorage.setItem('push-enabled', '1'); } catch {}
    await savePushContextForSW(userId);
  } catch (e) {
    console.error('[push] resync failed:', e);
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  // Clear intent flag first so auto-resubscribe never fights a manual disable
  try { localStorage.removeItem('push-enabled'); } catch {}
  const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  logPushEvent('manual-unsubscribe', sub.endpoint.slice(-12));
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

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Detect in-app webviews (Messages, Gmail, Facebook, Instagram, etc.).
 * Push can NEVER work inside these, and iOS webviews don't even have
 * "Add to Home Screen" — users must escape to a real browser first.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Known in-app browser tokens (Facebook, Instagram, Messenger, LinkedIn,
  // Twitter/X, Snapchat, TikTok, Line, WeChat, Gmail/Google app, Pinterest)
  if (/(FBAN|FBAV|FB_IAB|Instagram|Messenger|LinkedInApp|Twitter|Snapchat|musical_ly|BytedanceWebview|Line\/|MicroMessenger|GSA\/|Pinterest)/i.test(ua)) {
    return true;
  }
  // Android WebView marker
  if (/android/i.test(ua) && /; wv\)/i.test(ua)) return true;
  // iOS: a WebKit browser without "Safari" in the UA is an embedded webview
  // (real Safari, Chrome iOS "CriOS", Firefox iOS "FxiOS", Edge iOS "EdgiOS" all include Safari)
  if (/iphone|ipad|ipod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) {
    return true;
  }
  return false;
}

/** Ask the server whether it has a push_subscriptions row for this device's endpoint. */
export async function checkServerSubscription(userId: string): Promise<{ onServer: boolean; devices: number } | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const res = await fetch('/api/push/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, endpoint: sub?.endpoint ?? null }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

export interface PushDebugInfo {
  permission: string;
  swRegistered: boolean;
  hasSubscription: boolean;
  keyMatch: boolean | null;
  endpointTail: string | null;
  recentEvents: { t: string; action: string; detail?: string }[];
}

/** Full client-side push state — for the settings diagnostics readout. */
export async function getPushDebugInfo(): Promise<PushDebugInfo> {
  const info: PushDebugInfo = {
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    swRegistered: false,
    hasSubscription: false,
    keyMatch: null,
    endpointTail: null,
    recentEvents: getPushEventLog().slice(-6).reverse(),
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    if (!reg) return info;
    info.swRegistered = true;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return info;
    info.hasSubscription = true;
    info.endpointTail = sub.endpoint.slice(-12);
    info.keyMatch = subscriptionMatchesKey(sub, VAPID_PUBLIC_KEY);
  } catch {}
  return info;
}
