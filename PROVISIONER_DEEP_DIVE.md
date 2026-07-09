# Provisioner Deep Dive — How an Agent Gets Built

## Overview

When a new org is created through the setup wizard, `provision-org.ts` runs end-to-end and does 10 sequential steps. This doc covers exactly what user inputs drive what, how the environment is built, and how Supabase connects to the running agent.

---

## What the User Inputs (Wizard)

| Field | Where it goes |
|---|---|
| **Company name** | `org.name`, `orgConfig.org_name`, all bootstrap files |
| **Org slug** (auto-generated) | Container name, workspace path, channel IDs, agent name in DB |
| **Industry** | SOUL.md, AGENTS.md company context section |
| **What you sell** | SOUL.md, AGENTS.md, KNOWLEDGE.md |
| **Website** | KNOWLEDGE.md, `org_config.json` |
| **Agent name** (e.g. "Vanessa") | `agents.display_name`, SOUL.md, container label |
| **Agent tone** (`professional` / `friendly` / `direct`) | SOUL.md personality section |
| **Agent focus** (`qualify`, `calls`, `emails`, `sms`) | Which channels get created; which sections appear in TOOLS.md |
| **Rep names + emails + phones** | Channel IDs, portal_users, CRM users, `org_config.json` reps array |
| **Company knowledge** (free text or doc upload) | KNOWLEDGE.md |
| **Business hours** | RULES.md |
| **Owner email** | `portal_users` owner row, Supabase auth invite |

---

## Step-by-Step: What Happens When You Hit Provision

### Step 1 — Create Organization (Portal Supabase)
Inserts a row into `organizations` table:
```
name, slug, plan: 'starter', active: true, brand_color: '#4c8bf0'
```
Returns `org.id` (UUID) — used in every subsequent insert.

---

### Step 2 — Create Agent Row (Portal Supabase)
Inserts into `agents` table:
```
org_id, template_id: 'vanessa', name: 'vanessa', display_name: <wizard>,
container_name: 'portal-agent-<slug>', container_status: 'provisioning',
workspace_path: '/root/.portal-agent-<slug>/workspace',
server_host: '142.93.29.212'
```
Also writes rep info (`name`, `slug`, `email`, `phone`) to `agents.reps` column — n8n reads this to route incoming calls to the right rep.

---

### Step 2b — Provision Telnyx Phone Number
Calls `provision-telnyx-number.ts`:
1. Searches Telnyx for an available US number with voice + SMS capabilities
2. Orders it
3. Assigns it to **Empower Shared SMS messaging profile** (`40019f2d-...`)
4. Assigns it to the 10DLC SMS campaign (currently Barnhaus temp, swaps to Empower once approved)

Phone number written to `agents.telnyx_phone_number` and later into `org_config.json`.

---

### Step 2c — Provision CRM Supabase Project
Calls `provision-supabase-crm.ts`:
1. Calls `POST https://api.supabase.com/v1/projects` with org name, db password, region `us-east-1`
2. Waits up to 60s for project to become `ACTIVE_HEALTHY`
3. Fetches the service role key from the new project
4. Runs the full CRM schema SQL against it (tables: `users`, `contacts`, `activities`, `tasks`, `transcription_jobs`)
5. Returns `{ projectRef, supabaseUrl, serviceRoleKey, dbPassword }`

Then: inserts rep records into the new CRM's `users` table so `crm_id` is populated. Builds `crmRepIds` map (`email → crm user UUID`) for later use in `org_config.json`.

CRM URL + service key written to `agents.crm_supabase_url` / `agents.crm_supabase_key`.

---

### Step 3 — Create Portal Channels (Portal Supabase)
Inserts into `portal_channels`. Which channels get created depends on `agentFocus`:

**Always created:**
- `<slug>-vanessa-lead-alerts` (feed — inbound lead notifications)
- `<slug>-vanessa-proposals` (feed — proposal drafts)
- Per rep: `<slug>-vanessa-<rep>` (chat — main rep workspace)

**Created if `calls` in agentFocus:**
- `<slug>-vanessa-call-recordings` (feed — call summaries from AssemblyAI)

**Created if `sms` in agentFocus:**
- Per rep: `<slug>-vanessa-<rep>-sms` (sms — SMS approval queue)

Channel IDs follow the pattern: `{orgSlug}-{agentSlug}-{suffix}`

---

### Step 4 — Create Portal Users
1. Inserts owner into `portal_users` (role: `owner`)
2. Adds owner to all channels via `portal_channel_members`
3. For each rep: calls `supabase.auth.admin.inviteUserByEmail()` → rep gets invite email
4. Creates `portal_users` record for rep (role: `rep`)
5. Adds rep to their own chat + SMS channel + shared feed channels

---

### Step 5 — Clone Workspace on DO Server (SSH)
1. SSH into `142.93.29.212` using the `RESET_SSH_KEY` env var
2. `cp -r /root/.sales-agent /root/.portal-agent-<slug>` — clones the full `.openclaw` directory from the base Barnhaus agent. This brings:
   - Installed plugins (`openclaw-portal-channel`, google, etc.)
   - Device pairing files (`devices/paired.json`) — so the container is pre-authorized
   - Extensions and config
3. Wipes workspace: `rm -rf /root/.portal-agent-<slug>/workspace`
4. Copies fresh template: `cp -r /root/portal-templates/vanessa /root/.portal-agent-<slug>/workspace`
5. Creates subdirs: `memory/`, `drafts/`, `reports/`, `proposals/`
6. Patches automation scripts: `sed -i 's/barnhaus-vanessa/<slug>-vanessa/g'` on all `.py` files
7. Clears SQLite runtime state (cron jobs, sessions, delivery queue, etc.) so the new org starts clean

---

### Step 6 — Write Bootstrap Files (Via SFTP)
Calls `buildBootstrapFiles()` → `generateAllFiles()` in `bootstrap-writer.ts`.

Files written to workspace (each written via temp file + SFTP to avoid shell escaping):

| File | What's in it |
|---|---|
| `SOUL.md` | Agent name, tone, company context, what they sell |
| `AGENTS.md` | Startup sequence, memory rules, channel routing per rep, instant action table, cron schedule, hard limits |
| `TOOLS.md` | CRM credentials, Telnyx SMS setup, portal channel IDs, Drive search limits, hard limits |
| `RULES.md` | Response rules, escalation, verification rules |
| `CRM_RULES.md` | Lead ownership, task creation, follow-up rules, research rules |
| `CAMPAIGNS.md` | Email/SMS campaign routing, batch rules |
| `KNOWLEDGE.md` | Company knowledge, products/services, business hours |

---

### Step 6b — Write `openclaw.json` (Agent Gateway Config)
Written to `/root/.portal-agent-<slug>/openclaw.json`. This is the OpenClaw gateway config — it tells the running agent:
- Which model to use: `google/gemini-3-flash-preview`
- Session timeout: `600s`
- Compaction: `safeguard` mode, `500kb` max active transcript, truncate after compaction
- **Portal channel plugin config:**
  - `supabaseUrl`: Portal Supabase (`xqvnpcxyyxxxydescfzw.supabase.co`)
  - `supabaseKey`: Portal service role key
  - `orgId`: the new org's UUID
  - `channelIds`: all channel IDs this agent listens on
  - `pollInterval: 500ms`
- Gateway auth token: `portal-agent-<slug>-2026`

**This is how Supabase connects to the agent.** The `openclaw-portal-channel` plugin opens a Supabase Realtime WebSocket to the Portal Supabase project, subscribes to `portal_messages` inserts for the specified `channelIds`, and dispatches incoming messages as turns to the agent. When the agent replies, the plugin inserts to `portal_messages` with `sender_type: 'agent'`.

---

### Step 6c — Write `org_config.json` (Automation Scripts Config)
Written to `workspace/automation/org_config.json`. All Python automation scripts (`send_sms.py`, `log_activity.py`, `portal_utils.py`, etc.) read this instead of hardcoding Barnhaus credentials:

```json
{
  "org_slug": "...",
  "org_id": "...",
  "org_name": "...",
  "org_website": "...",
  "agent_name": "...",
  "portal_supabase_url": "https://xqvnpcxyyxxxydescfzw.supabase.co",
  "portal_supabase_key": "<portal service role key>",
  "crm_supabase_url": "https://<new-project-ref>.supabase.co",
  "crm_supabase_key": "<crm service role key>",
  "telnyx_api_key": "...",
  "telnyx_from_number": "+1...",
  "telnyx_app_id": "2996679323039040927",
  "reps": [
    {
      "name": "Larry",
      "slug": "larry",
      "email": "larry@...",
      "phone": "+1...",
      "crm_id": "<uuid from CRM users table>",
      "portal_channel": "<slug>-vanessa-larry",
      "token_file": "larry_token.json"
    }
  ]
}
```

---

### Step 7 — Start Docker Container
```bash
docker run -d \
  --name portal-agent-<slug> \
  --restart unless-stopped \
  -e OPENCLAW_GATEWAY_TOKEN=portal-agent-<slug>-2026 \
  -v /root/.portal-agent-<slug>:/home/node/.openclaw \
  sales-agent-v2:latest
```

The volume mount is the key — everything the agent needs lives on the host at `/root/.portal-agent-<slug>/` and is mounted into `/home/node/.openclaw/` inside the container.

---

### Step 8 — Wait for Gateway Ready
Polls `docker exec ... openclaw.mjs cron list` every 2 seconds for up to 60 seconds. Once the gateway responds (even with "No cron jobs"), the container is confirmed ready.

---

### Step 9 — Seed Default Crons
Adds 3 default crons via `openclaw.mjs cron add`:

| Cron | Schedule | Message |
|---|---|---|
| Morning Briefing | Mon-Fri 8am CT | Priority leads, follow-ups due, anything urgent from yesterday |
| Inbox Scan | Every 30 min | Check Gmail for new lead emails, post alerts to lead-alerts |
| End-of-Day Report | Mon-Fri 5pm CT | Pipeline summary — calls, emails, new leads, follow-ups tomorrow |

Each cron is synced into `agent_cron_jobs` in Portal Supabase so the Automations page shows them.

---

### Step 10 — Seed Integration Credentials
Writes `agent_env_vars` rows in Portal Supabase for:
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Telnyx**: `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`
- **CRM Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

These show as "Connected" on the Integrations page of the portal.

---

## How Supabase Connects to the Agent — Summary

There are TWO Supabase projects per org:

### 1. Portal Supabase (`xqvnpcxyyxxxydescfzw.supabase.co`) — shared
- Stores: `organizations`, `agents`, `portal_channels`, `portal_users`, `portal_messages`, `agent_cron_jobs`, `agent_env_vars`
- The agent reads/writes `portal_messages` via the `openclaw-portal-channel` plugin
- Uses Supabase Realtime (WebSocket) to receive new messages instantly
- The portal frontend reads all this to render the UI

### 2. CRM Supabase (new project per org) — dedicated
- Stores: `users` (reps), `contacts` (leads), `activities`, `tasks`, `transcription_jobs`
- The agent's Python automation scripts (`log_activity.py`, `send_sms.py`, etc.) hit this directly using `org_config.json` credentials
- Referenced in TOOLS.md so the agent knows the URL and key

---

## Key Env Vars Required in Coolify (Portal App)

| Var | Used for |
|---|---|
| `SUPABASE_MANAGEMENT_API_KEY` | Creating new Supabase CRM projects |
| `TELNYX_API_KEY` | Buying and assigning phone numbers |
| `RESET_SSH_KEY` | SSH into DO server to clone workspace + start containers |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Seeding Google OAuth into integrations |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Portal Supabase reads/writes |
| `OPENAI_API_KEY` | NL cron parsing in Automations page |
