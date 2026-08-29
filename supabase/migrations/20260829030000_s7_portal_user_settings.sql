-- S7 — portal_user_settings (Portal Supabase xqvnpcxyyxxxydescfzw)
-- ⚠️ NOT YET APPLIED. Written on dev branch dev-S7-signature-editor.
-- Apply manually via Supabase Management API during the S7 verify step.
--
-- Per-rep self-serve settings: structured email-signature fields + briefing time.
-- Read by the portal Settings "My Settings" tab today; read by agent-side
-- send_email.py later (S22 cutover, behind SIGNATURE_FROM_DB=1 flag — see
-- plans/portal-productization/S7_send_email_db_read.patch).
--
-- Column mapping → send_email.py org_config reps[].signature keys:
--   signature_name       → full_name
--   signature_title      → title
--   signature_company    → company
--   signature_address    → address     (needed for byte-identical Preston sig)
--   signature_phone      → cell        (rendered as "<phone> Cell")
--   signature_website    → website     (rendered as <a href="https://…">…</a>)
--   signature_disclaimer → disclaimer  (rendered as small grey <span> block)
--   signature_extra_html → extra raw HTML line(s) appended inside the <br> block
--                          after the website line (logos, certs — optional)
-- (signature_address + signature_disclaimer are additions to the original S7
--  column spec: Preston's live ITS signature uses both and the verify step
--  requires byte-identical reproduction.)

CREATE TABLE IF NOT EXISTS public.portal_user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  signature_name text,
  signature_title text,
  signature_company text,
  signature_address text,
  signature_phone text,
  signature_website text,
  signature_disclaimer text,
  signature_extra_html text,
  briefing_time text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, org_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Consistent with S14 conventions: org-scoped SELECT via current_user_org_ids();
-- writes restricted to the caller's OWN row via current_portal_user_ids().
-- (Both helper functions already exist in the live Portal DB — used by the
-- portal_messages / organizations / portal_users policies.)
-- service_role bypasses RLS, so the portal API routes (admin client) and the
-- future send_email.py DB read keep working regardless.

ALTER TABLE public.portal_user_settings ENABLE ROW LEVEL SECURITY;

-- Org members can read settings rows in their org (admins may need to see
-- reps' signatures; same visibility level as portal_users itself).
CREATE POLICY user_settings_select_member ON public.portal_user_settings
  FOR SELECT USING (org_id IN (SELECT org_id FROM current_user_org_ids()));

-- A user may insert ONLY their own row, and only inside an org they belong to.
CREATE POLICY user_settings_insert_own ON public.portal_user_settings
  FOR INSERT WITH CHECK (
    user_id IN (SELECT user_id FROM current_portal_user_ids())
    AND org_id IN (SELECT org_id FROM current_user_org_ids())
  );

-- A user may update ONLY their own row (no cross-user/cross-org moves).
CREATE POLICY user_settings_update_own ON public.portal_user_settings
  FOR UPDATE USING (user_id IN (SELECT user_id FROM current_portal_user_ids()))
  WITH CHECK (
    user_id IN (SELECT user_id FROM current_portal_user_ids())
    AND org_id IN (SELECT org_id FROM current_user_org_ids())
  );

-- (no DELETE policy → browser blocked; service_role bypasses)

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP TABLE public.portal_user_settings;  (additive table, nothing reads it yet)
