'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { assembleSignature, signatureToHtml, EMPTY_SIGNATURE, type SignatureFields } from '@/lib/signature';

/**
 * S7 — "My Settings" tab: self-serve email signature (structured fields +
 * live preview rendered exactly as send_email.py assembles it) + a
 * send-test-email button that mails the caller's own address.
 */

interface FormState extends SignatureFields {
  briefing_time: string | null;
}

const EMPTY_FORM: FormState = { ...EMPTY_SIGNATURE, briefing_time: null };

const FIELD_DEFS: { key: keyof SignatureFields; label: string; placeholder: string }[] = [
  { key: 'signature_name', label: 'Full name', placeholder: 'Preston Canada' },
  { key: 'signature_title', label: 'Title', placeholder: 'Senior Account Executive' },
  { key: 'signature_company', label: 'Company', placeholder: 'Industrial Training Services, Inc.' },
  { key: 'signature_address', label: 'Address', placeholder: '120 Max Hurt Dr. Murray, KY 42071' },
  { key: 'signature_phone', label: 'Cell phone', placeholder: '317-513-9295' },
  { key: 'signature_website', label: 'Website', placeholder: 'www.company.com' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--sidebar-bg)',
  border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)',
  fontSize: '14px', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 500,
};

export default function MySettings({ orgId }: { orgId: string }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const loadedRef = useRef<string>('');

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetch(`/api/settings?orgId=${orgId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.settings) {
          const next: FormState = { ...EMPTY_FORM };
          for (const k of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
            if (typeof d.settings[k] === 'string') next[k] = d.settings[k];
          }
          setForm(next);
          loadedRef.current = JSON.stringify(next);
        } else {
          loadedRef.current = JSON.stringify(EMPTY_FORM);
        }
      })
      .catch(() => setError('Could not load your settings.'))
      .finally(() => setLoading(false));
  }, [orgId]);

  const assembled = useMemo(() => assembleSignature(form), [form]);
  const previewHtml = useMemo(() => signatureToHtml(assembled), [assembled]);
  const dirty = JSON.stringify(form) !== loadedRef.current;

  function set(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setTestResult('');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Save failed.');
      } else {
        loadedRef.current = JSON.stringify(form);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (testSending) return;
    setTestSending(true);
    setError('');
    setTestResult('');
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, fields: form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Test email failed.');
      } else {
        setTestResult(`Test email sent to ${data.sentTo} ✅`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Test email failed.');
    } finally {
      setTestSending(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '24px 0', color: 'var(--muted)', fontSize: '13px' }}>Loading your settings…</div>;
  }

  return (
    <div>
      {/* Signature */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Email Signature</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
          Used on every email your agent sends on your behalf. Leave everything blank to use your organization&apos;s default.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {FIELD_DEFS.map(f => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <input
                value={form[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <label style={labelStyle}>Confidentiality disclaimer (optional — small grey text below your signature)</label>
            <textarea
              value={form.signature_disclaimer ?? ''}
              onChange={e => set('signature_disclaimer', e.target.value)}
              placeholder="Confidentiality Warning: The information contained in this message…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced (extra HTML)'}
            </button>
            {showAdvanced && (
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>Extra HTML — appended as an extra line after the website (logos, certifications)</label>
                <textarea
                  value={form.signature_extra_html ?? ''}
                  onChange={e => set('signature_extra_html', e.target.value)}
                  placeholder='<img src="https://…/logo.png" alt="Company" height="40">'
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Live preview — exactly as it appears on outbound email</label>
            {assembled && (
              <button
                onClick={() => setShowRaw(!showRaw)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showRaw ? 'Rendered' : 'View source'}
              </button>
            )}
          </div>
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 20px', minHeight: '80px' }}>
            {assembled ? (
              showRaw ? (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px', color: '#333', fontFamily: 'monospace' }}>{assembled}</pre>
              ) : (
                <div
                  style={{ color: '#1a1a1a', fontSize: '14px', lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )
            ) : (
              <div style={{ color: '#999', fontSize: '13px', fontStyle: 'italic' }}>
                Enter your name above to build your signature. Empty = your organization&apos;s default signature.
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{
              padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: '6px',
              color: '#fff', fontWeight: 700, cursor: saving || !dirty ? 'default' : 'pointer', fontSize: '13px',
              opacity: saving || !dirty ? 0.5 : 1,
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={sendTest}
            disabled={testSending || !assembled}
            style={{
              padding: '9px 18px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--muted)', fontWeight: 600, cursor: testSending || !assembled ? 'default' : 'pointer',
              fontSize: '13px', opacity: testSending || !assembled ? 0.5 : 1,
            }}
          >
            {testSending ? 'Sending…' : '📧 Send test email to myself'}
          </button>
          {testResult && <span style={{ fontSize: '12px', color: '#22c55e' }}>{testResult}</span>}
        </div>
        {dirty && !saving && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
            Unsaved changes — the test email uses what&apos;s in the editor right now.
          </div>
        )}
        {error && (
          <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', fontSize: '12px', color: '#da3633' }}>
            ⚠️ {error}
          </div>
        )}
      </section>

      {/* Morning briefing time */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Morning Briefing</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
          When your daily briefing should arrive (your local time). Takes effect once briefing scheduling moves to the portal.
        </div>
        <input
          type="time"
          value={form.briefing_time ?? ''}
          onChange={e => set('briefing_time', e.target.value)}
          style={{ ...inputStyle, width: '160px' }}
        />
      </section>
    </div>
  );
}
