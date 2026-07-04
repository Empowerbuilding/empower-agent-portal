# PHASE 5 — Multi-Tenant n8n + Telnyx Routing

## The Problem
The call recording pipeline (Telnyx → n8n → AssemblyAI → portal) is hardcoded to the Barnhaus org:
- Telnyx webhook fires to a specific n8n workflow
- That workflow posts summaries to `barnhaus-atlas-call-recordings`
- AssemblyAI callback webhook hardcoded to one path

New orgs can't use voice/SMS until this is parameterized.

---

## Architecture: How Multi-Tenant Routing Works

Every org gets:
1. Their own Telnyx phone number (provisioned via API in Phase 1 or Integrations)
2. A Telnyx Connection that routes to ONE shared n8n webhook (not per-org)
3. The n8n webhook identifies the org from the Telnyx `from` or connection metadata
4. Routes to the right container + posts to the right portal channel

---

## Part A — Telnyx Number Auto-Provisioning

### In Phase 1 Provisioner (or Integrations connect):
```python
# Provision a DID from Telnyx
POST https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=US&filter[features][]=sms&filter[features][]=voice
# Pick first result
POST https://api.telnyx.com/v2/number_orders
{ "phone_numbers": [{ "phone_number": "+1..." }], "connection_id": "{SHARED_CONNECTION_ID}" }
```

- One shared Telnyx connection (messaging profile + voice connection) for all orgs
- Each number in the pool belongs to one org — identified by the `to` field in inbound webhooks
- Store in `agents` table: `telnyx_phone_number`

### Number → Org Lookup
When Telnyx fires a webhook, the `to` field is the customer's number.
n8n looks up which org owns that number → routes accordingly.

```sql
-- Add to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telnyx_phone_number text;
```

---

## Part B — Shared n8n Webhook with Org Routing

### Current: one workflow per agent type
Replace with: one routing webhook that dispatches to org-specific sub-flows OR passes org context through.

### New n8n Flow: "Telnyx Voice Router"
```
[Webhook: telnyx-voice-inbound]
  → [Code: Look up org from TO number via Supabase API]
      → [Code: Build org context { orgId, agentId, containerName, channelId }]
          → [HTTP: POST to /api/portal/trigger with org context + call data]
```

The portal API endpoint (`/api/portal/trigger`) then:
1. Finds the right agent via `agentId`
2. Sends message to that agent's container via `agentDockerExec`
3. Or posts directly to the org's portal channel

### Alternative (simpler): Org context via Telnyx tags
Telnyx allows adding metadata to numbers. Tag each number with `org_id`. Retrieve from webhook payload — no DB lookup needed.

---

## Part C — AssemblyAI Callback Per-Org

Current: hardcoded callback to `https://n8n.empowerbuilding.ai/webhook/assemblyai-callback`

Fix: include `org_id` in the AssemblyAI webhook URL as a path param or query param:
```
https://n8n.empowerbuilding.ai/webhook/assemblyai-callback?org_id={orgId}
```

n8n reads `org_id` from the query, looks up the org's portal channel, posts the summary there.

The new "AssemblyAI Transcript Callback" workflow already built (from July 3 session) needs to be generalized:
- Current: hardcodes CRM Supabase URL + channel IDs for Barnhaus
- Fix: read org config from Supabase portal project using `org_id` → look up CRM URL + service key → post to right channel

---

## Part D — SMS Multi-Tenant

SMS is simpler — just number-based routing.

Inbound SMS webhook from Telnyx:
- `to` = org's number → look up `agents` table → find container → send to agent

The `send_sms.py` script in each container is already org-aware (uses the container's own TOOLS.md credentials).
Only the inbound routing needs to be updated.

### New n8n Flow: "Telnyx SMS Router"
```
[Webhook: telnyx-sms-inbound]
  → [Code: lookup org from TO number]
  → [Code: find agent container + SMS channel]
  → [HTTP: POST to portal_messages with sender info]
```

---

## Part E — Portal Trigger API

New endpoint to allow n8n to inject messages into any org's portal channel without hardcoding:

### `/app/api/portal/trigger/route.ts`
POST (API-key authenticated, internal only):
```json
{
  "orgId": "xxx",
  "channelId": "barnhaus-atlas-call-recordings",
  "content": "📞 Call Complete — ...",
  "metadata": { "transcript_id": "...", "contact_id": "..." }
}
```

This replaces the current n8n → Supabase direct insert pattern with a proper API.
Validates org ownership, handles the insert, triggers realtime.

---

## Build Order Within Phase 5

1. **Telnyx number provisioning** (standalone, can build anytime)
2. **Number → org lookup** (DB column + Supabase query in n8n)
3. **Portal Trigger API** (`/api/portal/trigger`)
4. **SMS Router** n8n workflow (simpler than voice)
5. **Voice Router** n8n workflow
6. **AssemblyAI callback generalization** (update existing workflow)

---

## Files to Create / Modify

### New
- `/app/api/portal/trigger/route.ts` — Authenticated inbound channel message API
- `/scripts/provision-telnyx-number.ts` — Auto-provision + assign a number to an org

### n8n (new workflows)
- "Telnyx Voice Router" — replaces "Telnyx Voice Bridge" (keep old for Barnhaus until migrated)
- "Telnyx SMS Router" — replaces direct channel-specific SMS handling

### DB
- `agents.telnyx_phone_number` column
- `agents.crm_supabase_url`, `agents.crm_supabase_key` — or a separate `org_integrations` table

---

## Estimated Build Time
2 sessions. This is the most complex phase — touches n8n, Telnyx, Supabase, and the portal API. Can be built without affecting existing Barnhaus setup if done in parallel workflows.

---

## Migration Note for Barnhaus
Once the router workflows are live, Barnhaus migrates to them:
1. Assign current Barnhaus number (+18304076296) to the Barnhaus org row
2. Point Telnyx connection to the new shared webhook
3. Decommission old per-org n8n workflows
4. Verify end-to-end

Barnhaus stays on old workflows until migration is verified.
