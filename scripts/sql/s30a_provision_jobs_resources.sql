-- S30a: created-resource ledger on provision jobs.
-- Additive, nullable-safe migration — apply to the Portal Supabase project
-- (xqvnpcxyyxxxydescfzw) BEFORE deploying the s30a branch. The route tolerates
-- the column being absent (logs a non-fatal warning), so ordering is soft.
--
-- resources_created example:
--   ["db:organizations:<uuid>", "db:agents:<uuid>", "telnyx:number:<id>",
--    "supabase:crm-project:<ref>", "host:dir:/root/.acme-agent",
--    "host:container:acme-openclaw", "n8n:workflow:<id>"]
--
-- Purpose: rollback / manual cleanup may only ever touch resources listed here
-- for the job in question. A job that dies mid-run (Coolify redeploy — risk R6)
-- leaves an exact audit trail of what it created.

alter table provision_jobs
  add column if not exists resources_created jsonb not null default '[]'::jsonb;

comment on column provision_jobs.resources_created is
  'S30a: ledger of resources created by this provisioning job (and ONLY this job). Rollback/cleanup must be limited to entries in this list.';
