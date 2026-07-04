# PLATFORM OVERVIEW — Agent Portal SaaS

## What We're Building
A self-serve platform where sales teams can spin up their own AI sales agent (based on the Vanessa template), configure it through a UI, connect their tools, and start using it — without Mitch touching anything.

## Current State — What's Already Built

### ✅ Fully Working
- **Agent router** (`lib/agent-router.ts`) — SSH → docker exec → any container. Adding a new agent is just a DB row. Multi-agent support is already there architecturally.
- **Multi-org data model** — `org_id` on everything. `portal_channels → agents → server/container` routing is complete.
- **Crons page + API** — Create, enable, disable, delete crons via the portal. UI works. API calls `openclaw cron` inside the container. Already functional.
- **Integrations page + API** — Beautiful UI, category filters, connected/partial/disconnected status. Saves keys to `agent_env_vars` table. Missing: sync to TOOLS.md (keys saved but agent doesn't know about them yet).
- **Files API** (`/api/agents/[agentId]/files`) — Read and write any .md file in the agent workspace via SSH. This is the key to writing bootstrap files from the portal.
- **Settings** — Org name, team members, invite flow, pending invites, agent list, nav to Files + Integrations.
- **Chat, approval, SMS, feed windows** — All working for Vanessa.
- **Push notifications pipeline** — Built end to end, just needs opt-in.
- **Auth, invites, roles** — owner / admin / rep, invite by email, accept flow.

### 🟡 Partially Built
- **Integrations → agent config sync** — Saves to DB, does NOT write to TOOLS.md. Agent is unaware of connected integrations.
- **`Agent` type has `soul_md`, `agents_md`, `tools_md`, `memory_md` fields** — Early prep for templating. Not used yet.
- **`template_id` on agents table** — Set up for a template system. No templates defined yet.

### ❌ Not Built
- **Onboarding wizard** — No page exists.
- **Provisioner** — No script to spin up a new org/agent automatically.
- **Default crons on launch** — No seeding when a new org is created.
- **NL cron creation** — Cron modal requires manual schedule input. No natural language → schedule parsing.
- **Multi-tenant n8n webhooks** — Telnyx, AssemblyAI webhooks hardcoded to Vanessa. New orgs can't use the recording pipeline without manual n8n workflow duplication.
- **Telnyx number auto-provisioning** — Currently manual (pick a number in Telnyx dashboard). Telnyx API can do this automatically.
- **Gmail OAuth flow for new orgs** — Works for Empower accounts. Needs a generic OAuth callback + token storage per org.

---

## The 5 Build Phases

| Phase | What | Unlocks |
|-------|------|---------|
| 1 | Provisioner | Automated org spin-up, no manual work |
| 2 | Onboarding Wizard | Self-serve signup, bootstrap files written from UI |
| 3 | Integrations → TOOLS.md sync | Connecting an integration actually configures the agent |
| 4 | Crons (defaults + NL) | Agent is ready to work on day 1, new crons via plain English |
| 5 | Multi-tenant n8n routing | Phone calls, recordings, SMS work for every new org |

Phases 1–4 can be done independently of each other in parallel.
Phase 5 depends on Phase 1 (need an org to route for).

See individual phase files for detailed steps:
- `PLATFORM_PHASE_1.md` — Provisioner
- `PLATFORM_PHASE_2.md` — Onboarding Wizard
- `PLATFORM_PHASE_3.md` — Integrations → TOOLS.md sync
- `PLATFORM_PHASE_4.md` — Crons (defaults + NL)
- `PLATFORM_PHASE_5.md` — Multi-tenant n8n + Telnyx routing
