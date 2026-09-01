'use client';

// S29 Phase 1 — Rules & Recipes page.
// Rules grouped by scope with precedence platform > org > user:
//  · Platform rules: locked ones render read-only (🔒 — safety invariants).
//    Unlocked ones show the org-effective state; org admins toggling them
//    creates/updates an org-scope OVERRIDE row (precedence: org > platform).
//  · Org rules: org-specific rows; org admins toggle directly.
//  · My rules: the caller's own user-scope rows; any user toggles their own.
// Recipes tab: read-only platform catalog cards; org admins enable/disable
// per org via the org_recipes join table.
//
// Enforcement is layered — this page is convenience UI only. All writes go
// through the browser Supabase client under the S29 RLS policies
// (rules_*_org_admin / rules_*_user_own / org_recipes_*_admin); no API
// routes, no service-role. RLS silently no-ops blocked writes, so every
// write reads back and surfaces "blocked" instead of lying (S28 pattern).
//
// The S29 tables may not exist live yet (migration is staged, not applied) —
// the page detects that and degrades to a friendly empty state.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Rule {
  id: string;
  scope: 'platform' | 'org' | 'user';
  org_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  rule_key: string;
  title: string;
  description: string | null;
  enabled: boolean;
  locked: boolean;
  sort: number;
}

interface Recipe {
  id: string;
  recipe_key: string;
  name: string;
  description: string | null;
  category: string | null;
  enabled: boolean;
  sort: number;
}

interface OrgRecipe {
  recipe_id: string;
  enabled: boolean;
}

const sectionTitle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 0 10px',
};

const card: React.CSSProperties = {
  background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
  borderRadius: '10px', padding: '12px 14px',
  display: 'flex', gap: 12, alignItems: 'flex-start',
};

const chip: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 10,
  border: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap',
};

function Toggle({ on, disabled, busy, onClick, title }: {
  on: boolean; disabled?: boolean; busy?: boolean; onClick?: () => void; title?: string;
}) {
  return (
    <button
      onClick={disabled || busy ? undefined : onClick}
      title={title}
      aria-checked={on}
      role="switch"
      style={{
        width: 40, height: 22, borderRadius: 11, border: '1px solid var(--border)',
        background: on ? 'var(--accent)' : 'rgba(128,128,128,0.25)',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : busy ? 0.6 : 1, flexShrink: 0, padding: 0,
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
      }} />
    </button>
  );
}

function RuleCard({ rule, effective, overridden, canToggle, busy, onToggle, onReset, note }: {
  rule: Rule; effective: boolean; overridden?: boolean; canToggle: boolean;
  busy: boolean; onToggle: () => void; onReset?: () => void; note?: string;
}) {
  return (
    <div style={card}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {rule.locked && <span title="Platform safety rule — cannot be overridden">🔒</span>}
          {rule.title}
          {overridden && <span style={chip}>org override</span>}
          {note && <span style={chip}>{note}</span>}
        </div>
        {rule.description && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
            {rule.description}
          </div>
        )}
        {overridden && onReset && (
          <button
            onClick={busy ? undefined : onReset}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 6 }}
          >
            Reset to platform default
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <Toggle
          on={effective}
          disabled={!canToggle}
          busy={busy}
          onClick={onToggle}
          title={rule.locked ? 'Locked platform rule' : !canToggle ? 'Admins only' : effective ? 'Disable' : 'Enable'}
        />
        <span style={{ fontSize: 11, color: effective ? '#22c55e' : 'var(--muted)' }}>
          {effective ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'rules' | 'recipes'>('rules');
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState('');
  const [myPortalUserId, setMyPortalUserId] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [orgRecipes, setOrgRecipes] = useState<OrgRecipe[]>([]);
  const [rulesMissing, setRulesMissing] = useState(false);
  const [recipesMissing, setRecipesMissing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // rule_key or recipe id in flight
  const [error, setError] = useState('');

  const isAdmin = role === 'owner' || role === 'admin';

  const loadRules = useCallback(async (org: string) => {
    // Platform rows + this org's rows (RLS scopes further). Two ORed filters.
    const { data, error: err } = await supabase
      .from('agent_rules')
      .select('id, scope, org_id, user_id, agent_id, rule_key, title, description, enabled, locked, sort')
      .or(`scope.eq.platform,org_id.eq.${org}`)
      .order('sort')
      .order('title');
    if (err) { setRulesMissing(true); return; }
    setRulesMissing(false);
    setRules((data as Rule[]) ?? []);
  }, [supabase]);

  const loadRecipes = useCallback(async (org: string) => {
    const { data: cat, error: catErr } = await supabase
      .from('recipe_catalog')
      .select('id, recipe_key, name, description, category, enabled, sort')
      .eq('enabled', true)
      .order('sort');
    if (catErr) { setRecipesMissing(true); return; }
    setRecipesMissing(false);
    setRecipes((cat as Recipe[]) ?? []);
    const { data: org_rows } = await supabase
      .from('org_recipes')
      .select('recipe_id, enabled')
      .eq('org_id', org);
    setOrgRecipes((org_rows as OrgRecipe[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: org } = await supabase
        .from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) { setLoaded(true); return; }
      setOrgId(org.id);

      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: pu } = await supabase
          .from('portal_users').select('id, role')
          .eq('supabase_auth_id', authData.user.id).eq('org_id', org.id).single();
        setRole(pu?.role ?? '');
        setMyPortalUserId(pu?.id ?? '');
      }

      await Promise.all([loadRules(org.id), loadRecipes(org.id)]);
      setLoaded(true);
    })();
  }, [orgSlug, supabase, loadRules, loadRecipes]);

  const platformRules = rules.filter(r => r.scope === 'platform');
  const platformKeys = new Set(platformRules.map(r => r.rule_key));
  const orgRules = rules.filter(r => r.scope === 'org');
  const orgOverrideByKey = new Map(orgRules.filter(r => platformKeys.has(r.rule_key)).map(r => [r.rule_key, r]));
  const pureOrgRules = orgRules.filter(r => !platformKeys.has(r.rule_key));
  const myRules = rules.filter(r => r.scope === 'user' && r.user_id === myPortalUserId);

  // ── Rule writes (RLS-enforced; read back to detect silent no-ops) ──────────

  async function togglePlatformRule(rule: Rule) {
    if (saving || rule.locked || !isAdmin) return;
    setError('');
    setSaving(rule.rule_key);
    const override = orgOverrideByKey.get(rule.rule_key);
    const target = !(override ? override.enabled : rule.enabled);
    let err: string | null = null;
    if (override) {
      const { error: e } = await supabase.from('agent_rules')
        .update({ enabled: target, updated_at: new Date().toISOString() })
        .eq('id', override.id);
      err = e?.message ?? null;
    } else {
      const { error: e } = await supabase.from('agent_rules').insert({
        scope: 'org', org_id: orgId, rule_key: rule.rule_key,
        title: rule.title, description: rule.description, enabled: target,
      });
      err = e?.message ?? null;
    }
    if (err) { setError(`Rule update failed: ${err}`); setSaving(null); return; }
    await loadRules(orgId); // read-back: RLS no-op shows as unchanged state
    setSaving(null);
  }

  async function resetOverride(rule: Rule) {
    if (saving || !isAdmin) return;
    const override = orgOverrideByKey.get(rule.rule_key);
    if (!override) return;
    setError('');
    setSaving(rule.rule_key);
    const { error: e } = await supabase.from('agent_rules').delete().eq('id', override.id);
    if (e) setError(`Reset failed: ${e.message}`);
    await loadRules(orgId);
    setSaving(null);
  }

  async function toggleRow(rule: Rule, allowed: boolean) {
    if (saving || !allowed) return;
    setError('');
    setSaving(rule.rule_key);
    const { error: e } = await supabase.from('agent_rules')
      .update({ enabled: !rule.enabled, updated_at: new Date().toISOString() })
      .eq('id', rule.id);
    if (e) { setError(`Rule update failed: ${e.message}`); setSaving(null); return; }
    const { data: check } = await supabase.from('agent_rules').select('enabled').eq('id', rule.id).single();
    if (check && check.enabled === rule.enabled) {
      setError('Update was blocked — you don\u2019t have permission to change this rule.');
    }
    await loadRules(orgId);
    setSaving(null);
  }

  // ── Recipe writes ───────────────────────────────────────────────────────────

  async function toggleRecipe(recipe: Recipe) {
    if (saving || !isAdmin) return;
    setError('');
    setSaving(recipe.id);
    const existing = orgRecipes.find(r => r.recipe_id === recipe.id);
    const target = !(existing ? existing.enabled : false);
    const { error: e } = await supabase.from('org_recipes').upsert({
      org_id: orgId, recipe_id: recipe.id, enabled: target,
      enabled_by: myPortalUserId || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,recipe_id' });
    if (e) { setError(`Recipe update failed: ${e.message}`); setSaving(null); return; }
    // Read-back (RLS silently no-ops non-admin upserts).
    const { data: rows } = await supabase.from('org_recipes')
      .select('recipe_id, enabled').eq('org_id', orgId);
    const applied = (rows as OrgRecipe[]) ?? [];
    setOrgRecipes(applied);
    const now = applied.find(r => r.recipe_id === recipe.id);
    if ((now?.enabled ?? false) !== target) {
      setError('Recipe update was blocked — admin role required.');
    }
    setSaving(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!loaded) {
    return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>📏 Rules &amp; Recipes</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
        Behavior rules for your agents (platform → org → user precedence) and toggleable automation recipes.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['rules', 'recipes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--muted)',
            }}
          >
            {t === 'rules' ? 'Rules' : 'Recipes'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ ...card, borderColor: '#ef4444', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {tab === 'rules' && (
        rulesMissing ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
            Rules aren&apos;t live for this workspace yet — the schema hasn&apos;t been activated. Nothing to configure here for now.
          </p>
        ) : (
          <>
            <div style={sectionTitle}>Platform rules</div>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: -4 }}>
              Fleet-wide defaults. 🔒 rules are safety invariants and can&apos;t be changed.
              {isAdmin ? ' Toggling an unlocked rule creates an org-level override.' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {platformRules.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No platform rules defined yet.</p>}
              {platformRules.map(rule => {
                const override = orgOverrideByKey.get(rule.rule_key);
                return (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    effective={override ? override.enabled : rule.enabled}
                    overridden={!!override}
                    canToggle={!rule.locked && isAdmin}
                    busy={saving === rule.rule_key}
                    onToggle={() => togglePlatformRule(rule)}
                    onReset={isAdmin ? () => resetOverride(rule) : undefined}
                  />
                );
              })}
            </div>

            <div style={sectionTitle}>Org rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pureOrgRules.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                  No org-specific rules yet{isAdmin ? '' : ' — ask an admin to set some up'}.
                </p>
              )}
              {pureOrgRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  effective={rule.enabled}
                  canToggle={isAdmin}
                  busy={saving === rule.rule_key}
                  onToggle={() => toggleRow(rule, isAdmin)}
                  note={rule.agent_id ? 'one agent' : undefined}
                />
              ))}
            </div>

            <div style={sectionTitle}>My rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myRules.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                  No personal rules yet — per-user overrides arrive in a later phase.
                </p>
              )}
              {myRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  effective={rule.enabled}
                  canToggle
                  busy={saving === rule.rule_key}
                  onToggle={() => toggleRow(rule, true)}
                />
              ))}
            </div>
          </>
        )
      )}

      {tab === 'recipes' && (
        recipesMissing ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
            The recipe catalog isn&apos;t live yet — check back once it&apos;s activated.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              Pre-built automations from the platform catalog.{' '}
              {isAdmin ? 'Enable the ones you want for this workspace.' : 'Admins can enable them for this workspace.'}{' '}
              (Enabling records intent — recipes start running in a later phase.)
            </p>
            {recipes.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No recipes in the catalog yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {recipes.map(recipe => {
                  const orgRow = orgRecipes.find(r => r.recipe_id === recipe.id);
                  const on = orgRow?.enabled ?? false;
                  return (
                    <div key={recipe.id} style={{ ...card, flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{recipe.name}</span>
                        <Toggle
                          on={on}
                          disabled={!isAdmin}
                          busy={saving === recipe.id}
                          onClick={() => toggleRecipe(recipe)}
                          title={isAdmin ? (on ? 'Disable for this org' : 'Enable for this org') : 'Admins only'}
                        />
                      </div>
                      {recipe.category && <span style={{ ...chip, alignSelf: 'flex-start' }}>{recipe.category}</span>}
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                        {recipe.description}
                      </div>
                      <span style={{ fontSize: 11, color: on ? '#22c55e' : 'var(--muted)' }}>
                        {on ? 'Enabled for this workspace' : 'Off'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
