# PHASE 1 — Provisioner

## Goal
Automated script that spins up a complete new org + agent with zero manual work. Takes ~2 minutes, results in a fully running agent container with workspace files, DB rows, and portal channels ready.

## What the Provisioner Does (in order)

### Step 1 — Create DB rows
```
INSERT organizations (name, slug, plan)
INSERT agents (org_id, name, display_name, template_id='vanessa', container_name, workspace_path, server_host, ssh_key_secret)
INSERT portal_channels (org_id, agent_id, ...) × N default channels
INSERT portal_users (org_id, email, name, role='owner') — for the signup user
```

Default channels to create:
- `{slug}-vanessa-larry` — chat (main sales channel)
- `{slug}-vanessa-shannon` — chat (second rep)
- `{slug}-vanessa-general` — chat (general)
- `{slug}-vanessa-sms-drafts` — sms
- `{slug}-atlas-lead-alerts` — feed
- `{slug}-atlas-call-recordings` — feed

### Step 2 — Clone workspace on DO server
SSH to 142.93.29.212 and:
```bash
cp -r /home/node/workspaces/vanessa-template /home/node/workspaces/{slug}
chown -R node:node /home/node/workspaces/{slug}
```

Vanessa's current workspace at `/home/node/.openclaw/workspace` becomes the template source.
Need to create `/home/node/workspaces/vanessa-template/` as a clean copy (strip Barnhaus-specific MEMORY.md, keep structure).

### Step 3 — Write initial bootstrap files
Using the Files API (SSH write) or direct SSH, write placeholder versions:
- `SOUL.md` — from template, with `{{company_name}}` placeholders filled
- `IDENTITY.md` — agent name, role
- `USER.md` — rep names/emails (from wizard step)
- `AGENTS.md` — routing rules + rep names
- `TOOLS.md` — empty sections, ready for integrations to fill
- `MEMORY.md` — blank

The Wizard (Phase 2) refines these. The provisioner just needs working defaults so the agent can start.

### Step 4 — Start Docker container
```bash
docker run -d \
  --name {container_name} \
  --env OPENCLAW_WORKSPACE=/home/node/.openclaw/workspace \
  -v /home/node/workspaces/{slug}:/home/node/.openclaw/workspace \
  --restart unless-stopped \
  openclaw:latest
```

Container name format: `portal-agent-{slug}`

### Step 5 — Wait for container ready
Poll `docker exec {container} echo ok` until it responds (max 30s).

### Step 6 — Seed default crons
```bash
docker exec {container} node /app/openclaw.mjs cron add \
  --name "Morning Briefing" \
  --cron "0 8 * * 1-5" \
  --session isolated \
  "Send the morning briefing to the team with today's priority leads and any follow-ups due"

docker exec {container} node /app/openclaw.mjs cron add \
  --name "Inbox Scan" \
  --every "10m" \
  --session isolated \
  "Check Gmail for new lead emails and post any new ones to the alerts channel"

docker exec {container} node /app/openclaw.mjs cron add \
  --name "Pipeline Report" \
  --cron "0 17 * * 1-5" \
  --session isolated \
  "Generate the end-of-day pipeline report and post to the general channel"
```

### Step 7 — Update agent status
```sql
UPDATE agents SET container_status = 'running' WHERE id = {agent_id}
```

---

## Files to Create

### `/scripts/provision-org.ts`
Main provisioner. Called from wizard completion OR manually.

```typescript
export async function provisionOrg(input: {
  orgName: string;
  orgSlug: string;
  ownerEmail: string;
  ownerName: string;
  agentDisplayName: string;
  reps: { name: string; email: string; phone?: string }[];
  templateId: string; // 'vanessa'
}): Promise<{ orgId: string; agentId: string; error?: string }>
```

### `/app/api/provision/route.ts`
POST endpoint that calls `provisionOrg`. Protected — owner/admin only OR unauthenticated for signup flow.

---

## DB Schema Additions Needed

```sql
-- agents table already has these — confirm they exist:
ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_path text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS server_host text DEFAULT '142.93.29.212';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS ssh_key_secret text DEFAULT 'default';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_id text DEFAULT 'vanessa';

-- Template workspaces registry
CREATE TABLE IF NOT EXISTS agent_templates (
  id text PRIMARY KEY, -- 'vanessa'
  name text,
  description text,
  workspace_src_path text, -- path on server to clone from
  default_channels jsonb, -- array of channel definitions
  default_crons jsonb -- array of cron definitions
);

INSERT INTO agent_templates VALUES (
  'vanessa',
  'Vanessa — Sales Agent',
  'AI inside sales agent for home builders and contractors',
  '/home/node/workspaces/vanessa-template',
  '[...]',
  '[...]'
);
```

---

## The Template Workspace

Before Phase 1 can work, need to create the template workspace on the DO server:
```bash
# SSH to server
cp -r /home/node/.openclaw/workspace /home/node/workspaces/vanessa-template
# Strip Barnhaus-specific content from template:
# - Clear MEMORY.md (keep structure, delete facts)
# - Clear memory/*.md daily logs
# - Anonymize USER.md (placeholder names)
# - Keep SOUL.md, AGENTS.md, TOOLS.md structure — replace specific values with {{placeholders}}
```

---

## Estimated Build Time
1 session. The provisioner is a script with clear inputs/outputs. No UI needed for Phase 1 — it's pure backend + SSH.
