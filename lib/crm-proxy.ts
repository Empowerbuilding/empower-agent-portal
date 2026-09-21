/**
 * CRM proxy URL helper.
 *
 * Since the 2026-09-20 key rotation, CRM Supabase keys are new-style
 * `sb_secret_` keys, which the Supabase API gateway rejects on browser
 * requests. Client components must therefore never receive the real CRM
 * key — instead they point supabase-js at this same-origin proxy route,
 * which authenticates the portal session and attaches the key server-side.
 */
export function crmProxyUrl(orgSlug: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://portal.empowerbuilding.ai').replace(/\/$/, '');
  return `${base}/api/crm-proxy/${orgSlug}`;
}

/** Dummy key passed to supabase-js in the browser; the proxy replaces it. */
export const CRM_PROXY_KEY = 'portal-proxy';
