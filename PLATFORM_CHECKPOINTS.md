# PLATFORM BUILD — Checkpoint Map

When building any phase, I stop and check in at these points.
I do NOT post progress updates mid-task — only at defined checkpoints.
Between checkpoints I keep going unless something is broken.

---

## Phase 1 — Provisioner

| Checkpoint | What I show you | What you decide |
|---|---|---|
| Before starting | Confirm: DO server path for template workspace, container naming convention | Approve or adjust |
| After DB schema changes | Show the exact SQL I ran, what tables/columns changed | Confirm looks right |
| After template workspace created | Show file list of what's in `vanessa-template/` | Approve or trim |
| After provisioner script written | Show the full script before running it | Approve then I run |
| After first test provision | Show: new org in DB, container running, crons seeded, workspace files | Approve or fix |
| ✅ Done | Summary of what was built, any caveats | Next phase or adjustments |

---

## Phase 2 — Onboarding Wizard

| Checkpoint | What I show you | What you decide |
|---|---|---|
| Before starting | Show proposed 6-step flow + field list | Cut steps, rename fields, or reorder |
| After `bootstrap-writer.ts` | Show sample generated SOUL.md, AGENTS.md from mock wizard answers | Adjust tone/content before wiring to UI |
| After wizard UI skeleton | Screenshot or describe the shell — nav, step indicators | Approve layout before I fill in steps |
| After each step component | Show what the step looks like and what it writes | Spot check — takes 1 min per step |
| After end-to-end test | Walk through full wizard → show resulting bootstrap files + org created | Approve or fix |
| ✅ Done | Summary + live URL to test | Sign off |

---

## Phase 3 — Integrations → TOOLS.md sync ✅ DONE 2026-07-04

- `lib/tools-md-writer.ts` — writes/replaces/removes integration sections in TOOLS.md
- env-vars POST → syncIntegrationToToolsMd (non-blocking, won't fail save)
- env-vars DELETE → removeIntegrationFromToolsMd  
- Google OAuth: /api/oauth/google → consent → /api/oauth/google/callback → token.json → TOOLS.md
- Integrations page: OAuth button for Google (Sign in with Google), API key form for all others
- isConnected() updated to detect OAuth via GOOGLE_ACCOUNT_EMAIL
- NEXT_PUBLIC_APP_URL env var added to Coolify portal app

---

## Phase 4 — Crons (defaults + NL) ✅ DONE 2026-07-04

- `/api/agents/[agentId]/crons/parse` — POST {text} → GPT-4o-mini → {name, scheduleType, scheduleValue, message, tz}
- OPENAI_API_KEY added to Coolify portal env
- AddCronModal: NL input at top with Parse → button, auto-fills fields below
- Edit button on each openclaw-cron row: opens modal pre-filled, delete+recreate on save
- Default crons seeded by provisioner in Phase 1

---

## Phase 5 — Multi-tenant n8n + Telnyx

| Checkpoint | What I show you | What you decide |
|---|---|---|
| Before starting | Confirm: keep old Barnhaus workflows running in parallel during build | Approve strategy |
| After Telnyx number provisioning script | Show test: provision a number → appears in Telnyx dashboard | Approve |
| After Portal Trigger API | Show test: POST to API → message appears in portal channel | Approve |
| After SMS Router n8n workflow | Test SMS to new org number → routes to right channel | Approve |
| After Voice Router n8n workflow | Test call to new org number → routes, records, transcribes | Approve |
| After AssemblyAI generalization | Test full pipeline on a real call to a test org | Approve |
| After Barnhaus migration | Verify Barnhaus still works on new routing | Approve before decommissioning old workflows |
| ✅ Done | Summary — all orgs on shared routing | Sign off |

---

## General Rules

**I keep going without asking when:**
- Installing packages
- Writing new files / components
- Making additive DB changes (new columns, new tables — never dropping)
- Running read-only checks (DB queries, container status, file reads)
- Fixing bugs I found myself during build

**I stop and ask when:**
- About to delete or rename something
- About to change a DB column that has live data on it
- The approach I planned doesn't work and I need to pick an alternative
- Something looks broken on the Barnhaus/production side
- I've hit a checkpoint above

**Format for checkpoint posts:**
> ✅ Phase X checkpoint — [name]
> [what I did]
> [what it looks like / what to check]
> [the decision or approval I need]

Short. No walls of text. If you say "looks good" or "go" I continue to the next checkpoint.
