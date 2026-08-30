-- S29 Phase 1 — agent_rules + recipe catalog (Portal Supabase xqvnpcxyyxxxydescfzw)
-- ⚠️ NOT YET APPLIED. Written on dev branch s29-user-rules.
-- Apply manually via Supabase Management API during the S29 activation step.
--
-- ── What this is ─────────────────────────────────────────────────────────────
-- Toggleable behavior rules for the agent fleet, resolved by precedence, plus
-- a platform recipe catalog with per-org enablement.
--
-- Phase 1 = schema + portal UI only. NOTHING enforces these rules in agent
-- containers yet (that's phase 2: bootstrap/plugin reads). Toggling a row in
-- the portal changes intent, not behavior, until phase 2 ships.
--
-- ── agent_rules precedence semantics ─────────────────────────────────────────
-- Scopes: 'platform' (fleet-wide defaults, org_id/user_id NULL)
--         'org'      (org override or org-specific rule, org_id set)
--         'user'     (per-rep override, org_id + user_id set)
-- agent_id NULL = applies to all of the org's agents; set = that agent only.
--
-- Effective value of rule_key K for (org O, user U, agent A):
--   1. If a platform row for K has locked = true → the platform row wins,
--      always. Lower scopes cannot create rows for a locked key (enforced by
--      RLS via agent_rule_key_locked()); any pre-existing lower rows are
--      ignored by resolvers.
--   2. Else most-specific row wins: user(U) > org(O) > platform.
--      Within a scope, an agent-specific row (agent_id = A) beats the
--      all-agents row (agent_id IS NULL).
--   3. No row anywhere → rule doesn't exist (agents behave as coded).
-- Resolvers (phase 2) should ORDER BY scope specificity DESC, agent_id NULLS
-- LAST, LIMIT 1 per rule_key after applying the locked short-circuit.
--
-- 'locked' is only meaningful (and only allowed) on platform rows — it means
-- "this is a safety invariant of the platform, orgs/users may not opt out"
-- (e.g. external sends always draft→approve).

CREATE TABLE IF NOT EXISTS public.agent_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform', 'org', 'user')),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.portal_users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  title text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  locked boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Scope shape invariants: platform rows are global; org rows belong to an
  -- org; user rows belong to a user inside an org.
  CONSTRAINT agent_rules_scope_shape CHECK (
    (scope = 'platform' AND org_id IS NULL AND user_id IS NULL AND agent_id IS NULL)
    OR (scope = 'org'  AND org_id IS NOT NULL AND user_id IS NULL)
    OR (scope = 'user' AND org_id IS NOT NULL AND user_id IS NOT NULL)
  ),
  -- locked is a platform-only concept.
  CONSTRAINT agent_rules_locked_platform_only CHECK (NOT locked OR scope = 'platform')
);

-- One row per (rule_key, scope target, agent target). NULL uuids folded to a
-- sentinel so the uniqueness actually holds (NULLs never collide otherwise).
CREATE UNIQUE INDEX IF NOT EXISTS agent_rules_unique_target ON public.agent_rules (
  rule_key,
  scope,
  coalesce(org_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS agent_rules_org_idx  ON public.agent_rules (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_rules_user_idx ON public.agent_rules (user_id) WHERE user_id IS NOT NULL;

-- SECURITY DEFINER helper: "is this rule_key locked at platform level?"
-- Needed inside agent_rules' own RLS policies — a plain subquery on the same
-- table from within a policy would recurse. Definer (table owner) bypasses RLS.
CREATE OR REPLACE FUNCTION public.agent_rule_key_locked(check_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_rules
    WHERE scope = 'platform' AND rule_key = check_key AND locked
  );
$$;

-- ── recipe catalog ───────────────────────────────────────────────────────────
-- Platform-curated automation recipes (cron briefings, follow-up drafts, …).
-- Per-org enablement lives in a JOIN TABLE (org_recipes), not an enabled_orgs
-- array on the catalog row, because:
--   · RLS: join-table rows are org-scoped, so the standard
--     current_user_org_ids() / current_user_is_org_admin() policies apply
--     directly — an array column on a platform table would need an org-admin
--     UPDATE policy on the *catalog* (cross-org write surface, races between
--     two orgs toggling simultaneously).
--   · Auditability/extensibility: the join row records who enabled it and
--     when, and gives phase 2 a natural home for per-org recipe config jsonb.

CREATE TABLE IF NOT EXISTS public.recipe_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,                              -- 'briefing' | 'follow-up' | 'reporting' | …
  template jsonb NOT NULL DEFAULT '{}'::jsonb, -- phase-2 execution payload (cron spec, channel, prompt skeleton)
  enabled boolean NOT NULL DEFAULT true,       -- platform-level availability kill-switch
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_recipes (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipe_catalog(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  enabled_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, recipe_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same conventions as S14: org-scoped reads via current_user_org_ids(),
-- admin writes via current_user_is_org_admin(), own-row writes via
-- current_portal_user_ids(). All three helpers are live in the Portal DB.
-- service_role bypasses RLS (portal API/admin tooling unaffected).

ALTER TABLE public.agent_rules ENABLE ROW LEVEL SECURITY;

-- Members read platform rules + rules in their own orgs.
CREATE POLICY rules_select_member ON public.agent_rules
  FOR SELECT USING (
    (scope = 'platform' AND auth.uid() IS NOT NULL)
    OR org_id IN (SELECT org_id FROM current_user_org_ids())
  );

-- Org admins create org-scope rows (org rules + org overrides of unlocked
-- platform rules). Never for locked keys; browser can never set locked=true
-- (scope='org' + the locked_platform_only CHECK already forbids it).
CREATE POLICY rules_insert_org_admin ON public.agent_rules
  FOR INSERT WITH CHECK (
    scope = 'org'
    AND public.current_user_is_org_admin(org_id)
    AND NOT public.agent_rule_key_locked(rule_key)
  );

CREATE POLICY rules_update_org_admin ON public.agent_rules
  FOR UPDATE USING (scope = 'org' AND public.current_user_is_org_admin(org_id))
  WITH CHECK (
    scope = 'org'
    AND public.current_user_is_org_admin(org_id)
    AND NOT public.agent_rule_key_locked(rule_key)
  );

-- Org admins may clear an org override (delete the row → fall back to platform).
CREATE POLICY rules_delete_org_admin ON public.agent_rules
  FOR DELETE USING (scope = 'org' AND public.current_user_is_org_admin(org_id));

-- Users manage ONLY their own user-scope rows, inside orgs they belong to,
-- never for locked keys.
CREATE POLICY rules_insert_user_own ON public.agent_rules
  FOR INSERT WITH CHECK (
    scope = 'user'
    AND user_id IN (SELECT user_id FROM current_portal_user_ids())
    AND org_id IN (SELECT org_id FROM current_user_org_ids())
    AND NOT public.agent_rule_key_locked(rule_key)
  );

CREATE POLICY rules_update_user_own ON public.agent_rules
  FOR UPDATE USING (scope = 'user' AND user_id IN (SELECT user_id FROM current_portal_user_ids()))
  WITH CHECK (
    scope = 'user'
    AND user_id IN (SELECT user_id FROM current_portal_user_ids())
    AND org_id IN (SELECT org_id FROM current_user_org_ids())
    AND NOT public.agent_rule_key_locked(rule_key)
  );

CREATE POLICY rules_delete_user_own ON public.agent_rules
  FOR DELETE USING (scope = 'user' AND user_id IN (SELECT user_id FROM current_portal_user_ids()));

-- Platform rows: NO browser write policy of any kind → read-only in the
-- portal; managed exclusively via service_role / migrations.

ALTER TABLE public.recipe_catalog ENABLE ROW LEVEL SECURITY;

-- Catalog is readable by any signed-in portal user; writes are service-role only.
CREATE POLICY recipes_select_authed ON public.recipe_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE public.org_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_recipes_select_member ON public.org_recipes
  FOR SELECT USING (org_id IN (SELECT org_id FROM current_user_org_ids()));

CREATE POLICY org_recipes_insert_admin ON public.org_recipes
  FOR INSERT WITH CHECK (public.current_user_is_org_admin(org_id));

CREATE POLICY org_recipes_update_admin ON public.org_recipes
  FOR UPDATE USING (public.current_user_is_org_admin(org_id))
  WITH CHECK (public.current_user_is_org_admin(org_id));

-- (no DELETE on org_recipes → disable = enabled=false, history preserved)

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP TABLE public.org_recipes;
-- DROP TABLE public.recipe_catalog;
-- DROP TABLE public.agent_rules;
-- DROP FUNCTION public.agent_rule_key_locked(text);
-- (all additive; nothing live reads them until phase 2)
