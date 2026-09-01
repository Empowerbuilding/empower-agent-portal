-- S29 Phase 1 — seed platform rules + starter recipe catalog
-- ⚠️ NOT YET APPLIED. Written on dev branch s29-user-rules.
-- Run AFTER 20260830230000_s29_agent_rules.sql, during the S29 activation step.
--
-- These are real rules the fleet already operates under today (enforced by
-- convention in AGENTS.md / bootstrap files, not yet by code — phase 2 wires
-- enforcement). The first two are locked: they are platform safety invariants
-- no org or user may opt out of.

INSERT INTO public.agent_rules (scope, rule_key, title, description, enabled, locked, sort) VALUES
  (
    'platform',
    'external_send_draft_approve',
    'External sends require draft → approve',
    'Agents never send email/SMS/posts to external recipients directly. Every outbound message is drafted first and sent only after a human approves it in the portal (approval channels / two-step email flow).',
    true, true, 10
  ),
  (
    'platform',
    'no_agent_self_modification',
    'No agent self-modification of bootstrap, code, or cron',
    'Agents may not edit their own bootstrap files (SOUL.md / AGENTS.md / TOOLS.md), container code, plugins, or cron schedules. Changes to agent behavior go through the portal or the operator — never through the agent itself.',
    true, true, 20
  ),
  (
    'platform',
    'sms_quiet_hours',
    'Quiet hours for SMS',
    'Placeholder — no outbound SMS between 9pm and 8am recipient-local time. Disabled until phase 2 defines the enforcement window and timezone source.',
    false, false, 30
  )
ON CONFLICT DO NOTHING;

-- Starter recipe catalog — automations that already run for Barnhaus agents
-- today as hand-built crons; the catalog makes them per-org toggleable
-- (phase 2 turns template payloads into provisioned crons).
INSERT INTO public.recipe_catalog (recipe_key, name, description, category, template, enabled, sort) VALUES
  (
    'daily_sales_brief',
    'Daily sales brief',
    'Every weekday morning the sales agent posts a brief to its briefs channel: new leads, follow-ups due, yesterday''s activity.',
    'briefing',
    '{"kind":"cron","schedule":"0 7 * * 1-5","channel_suffix":"briefs","prompt_key":"daily_sales_brief"}'::jsonb,
    true, 10
  ),
  (
    'lead_followup_drafts',
    'Lead follow-up drafts',
    'When a lead goes quiet for 3+ days, the agent drafts a follow-up email/SMS into the drafts channel for rep approval. Respects draft → approve.',
    'follow-up',
    '{"kind":"trigger","source":"crm.lead_stale","stale_days":3,"channel_suffix":"sms-drafts","prompt_key":"lead_followup"}'::jsonb,
    true, 20
  ),
  (
    'weekly_ad_performance',
    'Weekly ad performance report',
    'Weekly rollup of ad spend, leads, and cost-per-lead posted to the ad-performance channel.',
    'reporting',
    '{"kind":"cron","schedule":"0 8 * * 1","channel_suffix":"ad-performance","prompt_key":"weekly_ad_report"}'::jsonb,
    true, 30
  ),
  (
    'cash_flow_snapshot',
    'Cash flow snapshot',
    'Weekly QuickBooks cash-flow summary (balances, upcoming payables/receivables) posted to the finance channel.',
    'reporting',
    '{"kind":"cron","schedule":"0 8 * * 5","channel_suffix":"cash-flow","prompt_key":"cash_flow_snapshot"}'::jsonb,
    true, 40
  )
ON CONFLICT (recipe_key) DO NOTHING;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DELETE FROM public.agent_rules WHERE scope = 'platform'
--   AND rule_key IN ('external_send_draft_approve','no_agent_self_modification','sms_quiet_hours');
-- DELETE FROM public.recipe_catalog
--   WHERE recipe_key IN ('daily_sales_brief','lead_followup_drafts','weekly_ad_performance','cash_flow_snapshot');
