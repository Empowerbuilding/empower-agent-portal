'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

interface Rep {
  name: string;
  email: string;
  phone: string;
  label: string;
  bookingUrl: string;
  signOff: string;
}

interface WizardState {
  // Step 1
  orgName: string;
  orgSlug: string;
  industry: string;
  whatWeSell: string;
  website: string;
  phone: string;
  // Step 2
  agentName: string;
  agentRole: string;
  agentFocus: string[];
  agentTone: 'professional' | 'friendly' | 'direct';
  // Step 3
  reps: Rep[];
  // Step 4 (Knowledge)
  companyKnowledge: string;
  docFileName: string;
  businessHours: string;
  // Step 6
  enabledCrons: string[];
  customCronText: string;
}

const INDUSTRIES = [
  'Custom Home Building', 'General Contracting', 'Steel / Metal Buildings',
  'Real Estate', 'Home Remodeling', 'Commercial Construction', 'Other',
];

const FOCUS_OPTIONS = [
  { id: 'qualify', label: 'Qualify leads', desc: 'Ask the right questions, score prospects' },
  { id: 'calls', label: 'Schedule & log calls', desc: 'Initiate calls, log summaries to CRM' },
  { id: 'emails', label: 'Follow-up emails', desc: 'Draft personalized emails for rep approval' },
  { id: 'sms', label: 'SMS conversations', desc: 'Handle texts, draft replies for rep approval' },
  { id: 'proposals', label: 'Build proposals', desc: 'Generate proposals from CRM context' },
];

const DEFAULT_CRONS = [
  { id: 'morning-briefing', label: 'Morning Briefing', desc: 'Weekdays at 8am — priority leads, follow-ups due, anything urgent' },
  { id: 'inbox-scan', label: 'Inbox Scan', desc: 'Every 30 min — check Gmail for new lead emails' },
  { id: 'eod-report', label: 'End-of-Day Report', desc: 'Weekdays at 5pm — calls made, emails sent, pipeline summary' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', background: '#0d1117',
  border: '1px solid #30363d', borderRadius: '8px', color: 'var(--text)',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: '#6e7681', marginTop: '5px' }}>{hint}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const TOTAL = 6;

  const [state, setState] = useState<WizardState>({
    orgName: '', orgSlug: '', industry: 'Custom Home Building',
    whatWeSell: '', website: '', phone: '',
    agentName: 'Vanessa', agentRole: 'inside sales agent',
    agentFocus: ['qualify', 'emails', 'sms'], agentTone: 'professional',
    reps: [{ name: '', email: '', phone: '', label: 'Sales Rep', bookingUrl: '', signOff: '' }],
    companyKnowledge: '', docFileName: '', businessHours: '',
    enabledCrons: ['morning-briefing', 'inbox-scan', 'eod-report'],
    customCronText: '',
  });

  const [launching, setLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState('');
  const [error, setError] = useState('');
  const [launched, setLaunched] = useState<{ agentId: string; orgSlug: string; redirectTo: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  function update(patch: Partial<WizardState>) {
    setState(s => ({ ...s, ...patch }));
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function canNext(): boolean {
    if (step === 1) return !!(state.orgName.trim() && state.orgSlug.trim() && state.whatWeSell.trim());
    if (step === 2) return !!(state.agentName.trim() && state.agentFocus.length > 0);
    if (step === 3) return state.reps.length > 0 && state.reps.every(r => r.name.trim() && r.email.trim());
    return true;
  }

  async function handleLaunch() {
    setLaunching(true);
    setError('');

    const steps = [
      'Creating workspace…',
      'Configuring agent…',
      'Starting container…',
      'Seeding automations…',
      'Almost done…',
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length - 1) setLaunchStatus(steps[++i]);
    }, 15000);

    setLaunchStatus(steps[0]);

    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName: state.orgName,
          orgSlug: state.orgSlug,
          agentDisplayName: state.agentName,
          agentTone: state.agentTone === 'friendly' ? 'Friendly & conversational' :
                     state.agentTone === 'direct' ? 'Direct & fast' : 'Professional',
          industry: state.industry,
          whatWeSell: state.whatWeSell,
          website: state.website,
          reps: state.reps,
          companyKnowledge: state.companyKnowledge,
          businessHours: state.businessHours,
          enabledCrons: state.enabledCrons,
          wizard: {
            industry: state.industry,
            whatWeSell: state.whatWeSell,
            website: state.website,
            agentName: state.agentName,
            agentRole: state.agentRole,
            agentFocus: state.agentFocus,
            agentTone: state.agentTone,
            companyKnowledge: state.companyKnowledge,
            businessHours: state.businessHours,
            reps: state.reps,
          },
        }),
      });

      clearInterval(interval);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Launch failed — please try again');
        setLaunching(false);
        return;
      }

      // Async provisioning: redirect to progress page immediately
      if (data.jobId) {
        router.push(`/provision-progress?jobId=${data.jobId}&orgSlug=${data.orgSlug || state.orgSlug}`);
        return;
      }

      // Legacy sync fallback (if server returns success directly)
      setLaunchStatus('Done ✓');
      setTimeout(() => setLaunched({
        agentId: data.agentId,
        orgSlug: data.orgSlug || state.orgSlug,
        redirectTo: data.redirectTo || `/${state.orgSlug}/general`,
      }), 800);
    } catch (e: any) {
      clearInterval(interval);
      setError(e.message || 'Network error');
      setLaunching(false);
    }
  }

  // ── Step renderers ──────────────────────────────────────────────────────────

  function Step1() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Field label="Company name" hint="This is what your agent will call your company">
          <input style={inputStyle} value={state.orgName} placeholder="e.g. Pinnacle Custom Homes"
            onChange={e => {
              const name = e.target.value;
              update({ orgName: name, orgSlug: state.orgSlug || slugify(name) });
            }} />
        </Field>
        <Field label="URL slug" hint="Used in your portal URL — lowercase, hyphens only">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', overflow: 'hidden' }}>
            <span style={{ padding: '11px 12px', color: '#6e7681', fontSize: '13px', borderRight: '1px solid #30363d', whiteSpace: 'nowrap' }}>portal.empowerbuilding.ai/</span>
            <input style={{ ...inputStyle, border: 'none', borderRadius: '0', flex: 1 }} value={state.orgSlug} placeholder="pinnacle"
              onChange={e => update({ orgSlug: slugify(e.target.value) })} />
          </div>
        </Field>
        <Field label="Industry">
          <select style={{ ...inputStyle }} value={state.industry} onChange={e => update({ industry: e.target.value })}>
            {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="What do you sell?" hint="Be specific — your agent will use this when talking to leads">
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={state.whatWeSell}
            placeholder="e.g. Custom steel-frame barndominiums from 1,500–5,000 sq ft in the Texas Hill Country"
            onChange={e => update({ whatWeSell: e.target.value })} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Website" hint="Optional">
            <input style={inputStyle} value={state.website} placeholder="yourcompany.com" onChange={e => update({ website: e.target.value })} />
          </Field>
          <Field label="Phone" hint="Optional">
            <input style={inputStyle} value={state.phone} placeholder="(555) 000-0000" onChange={e => update({ phone: e.target.value })} />
          </Field>
        </div>
      </div>
    );
  }

  function Step2() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Agent name" hint="What your team will call her">
            <input style={inputStyle} value={state.agentName} placeholder="Vanessa" onChange={e => update({ agentName: e.target.value })} />
          </Field>
          <Field label="Role title">
            <input style={inputStyle} value={state.agentRole} placeholder="inside sales agent" onChange={e => update({ agentRole: e.target.value })} />
          </Field>
        </div>

        <Field label="What should she focus on?" hint="Select all that apply">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {FOCUS_OPTIONS.map(opt => {
              const checked = state.agentFocus.includes(opt.id);
              return (
                <div key={opt.id} onClick={() => {
                  update({ agentFocus: checked ? state.agentFocus.filter(f => f !== opt.id) : [...state.agentFocus, opt.id] });
                }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: checked ? 'rgba(59,130,246,0.1)' : '#0d1117', border: `1px solid ${checked ? 'rgba(59,130,246,0.5)' : '#30363d'}`, borderRadius: '8px', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '4px', background: checked ? '#3b82f6' : 'transparent', border: checked ? 'none' : '1px solid #484f58', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {checked && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#8b949e' }}>{opt.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="Communication style">
          <div style={{ display: 'flex', gap: '8px' }}>
            {([['professional', 'Professional'], ['friendly', 'Friendly'], ['direct', 'Direct & fast']] as const).map(([val, label]) => (
              <button key={val} onClick={() => update({ agentTone: val })} style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: state.agentTone === val ? '1px solid #3b82f6' : '1px solid #30363d', background: state.agentTone === val ? 'rgba(59,130,246,0.15)' : '#0d1117', color: state.agentTone === val ? '#3b82f6' : '#8b949e' }}>
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  function Step3() {
    function updateRep(i: number, patch: Partial<Rep>) {
      const reps = [...state.reps];
      reps[i] = { ...reps[i], ...patch };
      update({ reps });
    }
    function addRep() {
      if (state.reps.length < 5) update({ reps: [...state.reps, { name: '', email: '', phone: '', label: 'Sales Rep', bookingUrl: '', signOff: '' }] });
    }
    function removeRep(i: number) {
      if (state.reps.length > 1) update({ reps: state.reps.filter((_, idx) => idx !== i) });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>Add the sales reps who will use the portal. Each rep gets their own private chat channel with {state.agentName}.</div>
        {state.reps.map((rep, i) => (
          <div key={i} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' }}>Rep {i + 1}</span>
              {i > 0 && <button onClick={() => removeRep(i)} style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Name">
                <input style={inputStyle} value={rep.name} placeholder="Larry" onChange={e => updateRep(i, { name: e.target.value })} />
              </Field>
              <Field label="Role">
                <input style={inputStyle} value={rep.label} placeholder="Sales Rep" onChange={e => updateRep(i, { label: e.target.value })} />
              </Field>
              <Field label="Email">
                <input style={inputStyle} type="email" value={rep.email} placeholder="larry@company.com" onChange={e => updateRep(i, { email: e.target.value })} />
              </Field>
              <Field label="Phone" hint="Optional">
                <input style={inputStyle} value={rep.phone} placeholder="+1 555 000 0000" onChange={e => updateRep(i, { phone: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
        {state.reps.length < 5 && (
          <button onClick={addRep} style={{ padding: '10px', background: 'none', border: '1px dashed #30363d', borderRadius: '8px', color: '#8b949e', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            + Add another rep
          </button>
        )}
      </div>
    );
  }


  function Step4Knowledge() {

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        if (file.name.endsWith('.txt')) {
          const text = await file.text();
          update({ companyKnowledge: text.slice(0, 8000), docFileName: file.name });
        } else {
          update({ docFileName: file.name });
        }
      } finally {
        setUploading(false);
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>
          Give {state.agentName} company knowledge from day one — she'll read this every session and know your business cold.
        </div>

        <Field label="Company Knowledge" hint="What you sell, pricing tiers, objection handling, ideal customer">
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: '140px' }}
            value={state.companyKnowledge}
            placeholder={"Examples:\n• We build custom barndominiums 1,500–5,000 sq ft, starting at $180/sq ft\n• Ideal client: landowner in Texas with $350k+ budget\n• Common objection: \'too expensive\' — steel frame saves 20% on insurance\n• New construction only — no additions or remodels"}
            onChange={e => update({ companyKnowledge: e.target.value })}
          />
        </Field>

        <Field label="Upload a document (optional)" hint="TXT files auto-populate above. For PDF/DOCX, copy-paste key content into the box.">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', color: '#8b949e', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              📄 {uploading ? 'Reading…' : 'Choose file'}
              <input type="file" accept=".txt,.pdf,.docx" style={{ display: 'none' }} onChange={handleFile} />
            </label>
            {state.docFileName && <span style={{ fontSize: '12px', color: '#22c55e' }}>✓ {state.docFileName}</span>}
          </div>
          {state.docFileName && !state.docFileName.endsWith('.txt') && (
            <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>PDF/DOCX — copy key content into the box above.</div>
          )}
        </Field>

        <Field label="Business hours" hint="Used for call routing and response timing">
          <input style={inputStyle} value={state.businessHours} placeholder="Mon–Fri 8am–5pm CST" onChange={e => update({ businessHours: e.target.value })} />
        </Field>

        <div style={{ borderTop: '1px solid #21262d', paddingTop: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Rep Preferences</div>
          {state.reps.filter(r => r.name.trim()).map((rep, i) => (
            <div key={i} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>{rep.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Booking URL" hint="Optional — calendly, acuity, etc.">
                  <input style={inputStyle} value={rep.bookingUrl || ''} placeholder="calendly.com/repname"
                    onChange={e => { const reps = [...state.reps]; reps[i] = { ...reps[i], bookingUrl: e.target.value }; update({ reps }); }} />
                </Field>
                <Field label="Email sign-off" hint="How they close emails">
                  <input style={inputStyle} value={rep.signOff || ''} placeholder={`Thanks, ${rep.name.split(' ')[0]}`}
                    onChange={e => { const reps = [...state.reps]; reps[i] = { ...reps[i], signOff: e.target.value }; update({ reps }); }} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Step4() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>Connect your tools so {state.agentName} can send emails, make calls, and access your CRM. You can skip any of these and connect later in Settings.</div>
        {[
          { id: 'gmail', icon: '📧', name: 'Gmail', desc: 'Send follow-up emails and scan your inbox — connect right after launch', status: 'Connect at launch' },
          { id: 'telnyx', icon: '📞', name: 'Phone (Telnyx)', desc: 'SMS and voice calls — a number is auto-provisioned for you', status: 'Auto-provisioned' },
          { id: 'crm', icon: '🗄️', name: 'CRM', desc: 'Built-in CRM included — contacts, deals, activity log', status: 'Built-in included' },
        ].map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px' }}>
            <span style={{ fontSize: '24px' }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
              <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>{item.desc}</div>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: item.status === 'Built-in included' || item.status === 'Auto-provisioned' ? '#22c55e' : item.status === 'Connect at launch' ? '#3b82f6' : '#8b949e', background: item.status === 'Built-in included' || item.status === 'Auto-provisioned' ? 'rgba(34,197,94,0.1)' : item.status === 'Connect at launch' ? 'rgba(59,130,246,0.1)' : '#21262d', padding: '4px 10px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
              {item.status}
            </div>
          </div>
        ))}
        <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', fontSize: '12px', color: '#8b949e' }}>
          💡 All integrations can be connected in <strong style={{ color: 'var(--text)' }}>Settings → Integrations</strong> after launch.
        </div>
      </div>
    );
  }

  function Step5() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>{state.agentName} runs these automations on a schedule. Toggle any off, or add your own below.</div>
        {DEFAULT_CRONS.map(cron => {
          const enabled = state.enabledCrons.includes(cron.id);
          return (
            <div key={cron.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: '#0d1117', border: `1px solid ${enabled ? 'rgba(34,197,94,0.3)' : '#30363d'}`, borderRadius: '10px', cursor: 'pointer' }}
              onClick={() => update({ enabledCrons: enabled ? state.enabledCrons.filter(c => c !== cron.id) : [...state.enabledCrons, cron.id] })}>
              <div style={{ width: 20, height: 20, borderRadius: '20px', background: enabled ? '#22c55e' : '#21262d', border: enabled ? 'none' : '1px solid #484f58', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {enabled && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{cron.label}</div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{cron.desc}</div>
              </div>
            </div>
          );
        })}
        <div>
          <label style={labelStyle}>Custom automation (optional)</label>
          <input style={inputStyle} value={state.customCronText}
            placeholder={`e.g. "Text ${state.reps[0]?.name || 'the team'} every Friday at 4pm with a weekend follow-up list"`}
            onChange={e => update({ customCronText: e.target.value })} />
          <div style={{ fontSize: '11px', color: '#6e7681', marginTop: '5px' }}>Describe it in plain English — {state.agentName} will figure out the schedule.</div>
        </div>
      </div>
    );
  }

  function Step6() {
    const repCount = state.reps.filter(r => r.name.trim()).length;
    const cronCount = state.enabledCrons.length + (state.customCronText.trim() ? 1 : 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Summary card */}
        <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🤖</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{state.agentName}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>{state.agentRole} · {state.orgName}</div>
            </div>
          </div>
          {[
            ['🏢 Company', state.orgName],
            ['🏗️ Industry', state.industry],
            ['👥 Reps', state.reps.filter(r => r.name.trim()).map(r => r.name).join(', ')],
            ['⚡ Focus', state.agentFocus.join(', ')],
            ['🔔 Automations', `${cronCount} scheduled`],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', gap: '12px', padding: '10px 18px', borderBottom: '1px solid #21262d' }}>
              <span style={{ fontSize: '12px', color: '#8b949e', width: 120, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Progress / launch */}
        {launching ? (
          <div style={{ padding: '20px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', marginBottom: '10px' }}>⚙️</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>{launchStatus}</div>
            <div style={{ fontSize: '12px', color: '#8b949e' }}>This takes about 90 seconds. Hang tight.</div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#8b949e', textAlign: 'center', padding: '4px 0' }}>
            Everything looks good. Hit Launch to spin up your agent.
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 14px', background: 'rgba(218,54,51,0.08)', border: '1px solid rgba(218,54,51,0.3)', borderRadius: '8px', fontSize: '13px', color: '#da3633' }}>
            ⚠️ {error}
          </div>
        )}
      </div>
    );
  }

  const stepTitles = [
    'Your Company', 'Your Agent', 'Your Team',
    'Knowledge & Rules', 'Automations', 'Review & Launch',
  ];

  const stepComponents = [Step1, Step2, Step3, Step4Knowledge, Step5, Step6];

  // Post-launch: show Gmail connect screen before entering the org
  if (launched) {
    const gmailUrl = `/api/oauth/google?agentId=${launched.agentId}&returnTo=${encodeURIComponent(launched.redirectTo)}`;
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>🎉</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Agent is live!</div>
          <div style={{ fontSize: '14px', color: '#8b949e', marginBottom: '32px' }}>One last thing — connect Gmail so {state.agentName} can send follow-up emails and scan your inbox.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <a href={gmailUrl} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              padding: '14px 20px', background: '#fff', border: '1px solid #e2e2e2',
              borderRadius: '10px', color: '#333', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.3 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.8 6C12.7 13.3 17.9 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.2-4.5 6.8l7 5.4C43.2 37 46.1 31.2 46.1 24.5z"/><path fill="#FBBC05" d="M10.8 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7L2.5 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.3-5.9z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7-5.4c-2.1 1.4-4.8 2.2-8.2 2.2-6.1 0-11.3-3.8-13.2-9.2l-8.3 5.9C6.9 42.6 14.8 48 24 48z"/></svg>
              Connect Gmail
            </a>
            <button onClick={() => router.push(launched.redirectTo)} style={{
              padding: '12px 20px', background: 'none', border: '1px solid #30363d',
              borderRadius: '10px', color: '#8b949e', cursor: 'pointer', fontSize: '13px',
            }}>
              Skip for now — connect in Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '32px 16px 64px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '520px', marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>
          {step === 1 ? 'Set up your AI agent' : stepTitles[step - 1]}
        </div>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>Step {step} of {TOTAL}</div>
        {/* Progress bar */}
        <div style={{ marginTop: '14px', height: 4, background: '#21262d', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#3b82f6', borderRadius: '4px', width: `${(step / TOTAL) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: '520px', background: '#161b22', border: '1px solid #30363d', borderRadius: '14px', padding: '28px 24px' }}>
        {stepComponents[step - 1]()}
      </div>

      {/* Nav */}
      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', gap: '10px', marginTop: '16px' }}>
        {step === 1 && !launching && (
          <button onClick={() => router.push('/')}
            style={{ flex: 1, padding: '13px', background: 'none', border: '1px solid #30363d', borderRadius: '10px', color: '#8b949e', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            ← Back to portal
          </button>
        )}
        {step > 1 && !launching && (
          <button onClick={() => { setStep(s => s - 1); setError(''); }}
            style={{ flex: 1, padding: '13px', background: 'none', border: '1px solid #30363d', borderRadius: '10px', color: '#8b949e', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            ← Back
          </button>
        )}
        {step < TOTAL ? (
          <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
            style={{ flex: 2, padding: '13px', background: canNext() ? '#3b82f6' : '#21262d', border: 'none', borderRadius: '10px', color: canNext() ? '#fff' : '#6e7681', cursor: canNext() ? 'pointer' : 'default', fontSize: '14px', fontWeight: 700 }}>
            Continue →
          </button>
        ) : (
          <button onClick={handleLaunch} disabled={launching}
            style={{ flex: 2, padding: '13px', background: launching ? '#21262d' : '#22c55e', border: 'none', borderRadius: '10px', color: launching ? '#6e7681' : '#fff', cursor: launching ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700 }}>
            {launching ? launchStatus || 'Launching…' : '🚀 Launch Agent'}
          </button>
        )}
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '20px' }}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i + 1 === step ? '#3b82f6' : i + 1 < step ? '#22c55e' : '#30363d' }} />
        ))}
      </div>
    </div>
  );
}
