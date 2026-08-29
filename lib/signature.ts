/**
 * S7 — Email signature assembly.
 *
 * This is an EXACT TypeScript port of the per-rep signature branch in the
 * agent-side automation/send_email.py (ITS container, sig fix 2026-08-26):
 *
 *   _lines = ['<strong>' + _sig_cfg.get('full_name', _rep_name) + '</strong>']
 *   if _sig_cfg.get('title'):   _lines.append(_sig_cfg['title'])
 *   if _sig_cfg.get('company'): _lines.append(_sig_cfg['company'])
 *   if _sig_cfg.get('address'): _lines.append(_sig_cfg['address'])
 *   if _sig_cfg.get('cell'):    _lines.append(_sig_cfg['cell'] + ' Cell')
 *   if _sig_cfg.get('website'):
 *       _whref = _wurl if _wurl.startswith('http') else 'https://' + _wurl
 *       _lines.append('<a href="' + _whref + '">' + _wurl + '</a>')
 *   _sig = 'Thank you,\n\n' + '<br>'.join(_lines)
 *   if _sig_cfg.get('disclaimer'):
 *       _sig += '\n\n<span style="font-size:11px;color:#888888">' + disclaimer + '</span>'
 *
 * Reference: plans/portal-productization/S7_reference_signature.html (Preston).
 * If you change this function, the agent-side assembly must change in lockstep
 * or the portal preview stops matching what actually gets sent.
 */

export interface SignatureFields {
  signature_name: string | null;
  signature_title: string | null;
  signature_company: string | null;
  signature_address: string | null;
  signature_phone: string | null;
  signature_website: string | null;
  signature_disclaimer: string | null;
  signature_extra_html: string | null;
}

export const EMPTY_SIGNATURE: SignatureFields = {
  signature_name: null,
  signature_title: null,
  signature_company: null,
  signature_address: null,
  signature_phone: null,
  signature_website: null,
  signature_disclaimer: null,
  signature_extra_html: null,
};

/**
 * Assemble the raw signature string exactly as send_email.py injects it into
 * the email body (mixed markdown-ish text + inline HTML; the n8n formatter
 * converts \n → <br> at send time).
 *
 * Returns '' when no name is set (an empty row means "no custom signature" —
 * the agent falls back to the org-level default, same as today).
 */
export function assembleSignature(f: SignatureFields): string {
  const name = (f.signature_name ?? '').trim();
  if (!name) return '';

  const lines: string[] = ['<strong>' + name + '</strong>'];
  if (f.signature_title?.trim()) lines.push(f.signature_title.trim());
  if (f.signature_company?.trim()) lines.push(f.signature_company.trim());
  if (f.signature_address?.trim()) lines.push(f.signature_address.trim());
  if (f.signature_phone?.trim()) lines.push(f.signature_phone.trim() + ' Cell');
  const website = f.signature_website?.trim();
  if (website) {
    const href = website.startsWith('http') ? website : 'https://' + website;
    lines.push('<a href="' + href + '">' + website + '</a>');
  }
  // Extra raw HTML line(s) — appended inside the <br> block after the website
  // line (logos, certifications). Not part of the send_email.py port; empty
  // for every rep migrated from org_config (keeps byte-identical parity).
  if (f.signature_extra_html?.trim()) lines.push(f.signature_extra_html.trim());

  let sig = 'Thank you,\n\n' + lines.join('<br>');
  if (f.signature_disclaimer?.trim()) {
    sig += '\n\n<span style="font-size:11px;color:#888888">' + f.signature_disclaimer.trim() + '</span>';
  }
  return sig;
}

/**
 * Render the assembled signature string to display HTML the same way the
 * send pipeline does (send_email.py _md_to_html_basic, which mirrors the n8n
 * tony-send-email formatter): **bold** → <strong>, *italic* → <em>, \n → <br>.
 */
export function signatureToHtml(assembled: string): string {
  let h = assembled || '';
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return h.replace(/\n/g, '<br>');
}
