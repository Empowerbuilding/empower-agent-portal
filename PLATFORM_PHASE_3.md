# PHASE 3 — Integrations → TOOLS.md Sync

## The Problem
The integrations page already saves API keys to `agent_env_vars` in the DB. But the agent's TOOLS.md doesn't know about them — so connecting Resend in the portal doesn't actually let the agent use it. The keys live in the DB, not in the agent's workspace.

## The Fix
After saving any integration's credentials, write the relevant TOOLS.md section automatically via the Files API.

---

## How It Works

### Trigger
`POST /api/agents/{agentId}/env-vars` already handles saves.
Add a `syncToToolsMd(agentId, integrationId, vars)` call after the DB insert succeeds.

### `lib/tools-md-writer.ts`
New file. One function per integration that returns the TOOLS.md section string.

```typescript
export async function syncIntegrationToToolsMd(
  agentId: string,
  integrationId: string,
  vars: Record<string, string>
): Promise<void>
```

Internally:
1. Read current TOOLS.md via `agentReadFile(agentId, 'TOOLS.md')`
2. Find and replace the relevant section (or append if missing)
3. Write back via `agentWriteFile(agentId, 'TOOLS.md', newContent)`

---

## Integration → TOOLS.md Mapping

### Resend
```markdown
## Email (Resend)
- API Key: re_xxxxxxxxxxxx
- From: agent@theirdomain.com
- Endpoint: POST https://api.resend.com/emails
```

### Telnyx
```markdown
## SMS / Voice (Telnyx)
- API Key: KEY...
- From Number: +18005551234
- SMS: use send_sms.py
- Voice: use voice_dial.py
```

### AssemblyAI
```markdown
## Transcription (AssemblyAI)
- API Key: xxxxxxxxx
- Webhook: https://n8n.theirdomain.com/webhook/assemblyai-callback
- Use for: diarized call transcription
```

### Supabase
```markdown
## CRM (Supabase)
- URL: https://xxxx.supabase.co
- Service Role Key: eyJ...
- Tables: contacts, notes, activities, tasks, deals
```

### n8n
```markdown
## Automation (n8n)
- URL: https://n8n.theirdomain.com
- API Key: eyJ...
```

### Google Workspace (OAuth)
Different flow — OAuth token stored as a file in the workspace, not just an env var.
After OAuth callback:
1. Save token to `{workspace}/google_token.json` via SSH write
2. Write TOOLS.md section:
```markdown
## Google (Gmail + Calendar)
- Account: rep@theirdomain.com
- Token: /home/node/.openclaw/workspace/google_token.json
- Scopes: gmail.modify, calendar
```

---

## Section Detection in TOOLS.md
Use a regex to find and replace sections:
```typescript
function replaceSection(content: string, sectionHeader: string, newSection: string): string {
  // Find "## Section Name" through the next "## " or end of file
  // Replace with newSection
  // If not found, append
}
```

---

## Google OAuth Flow (needs its own implementation)

### New files:
- `/app/api/oauth/google/route.ts` — redirect to Google consent screen
- `/app/api/oauth/google/callback/route.ts` — handle token exchange, write to workspace

### Flow:
1. User clicks "Connect" on Google integration card
2. Redirected to `/api/oauth/google?agentId={id}`
3. Google consent screen (Gmail + Calendar scopes)
4. Callback at `/api/oauth/google/callback`
5. Exchange code for token
6. SSH-write token as JSON to `{workspace}/google_token.json`
7. Update `agent_env_vars` with account email
8. Call `syncIntegrationToToolsMd` for google
9. Redirect back to integrations page with `?connected=google`

---

## Microsoft 365 OAuth
Same pattern as Google. `/api/oauth/microsoft/route.ts` + callback.
Lower priority — do Google first.

---

## Disconnect Flow
When user clicks "Remove" on a connected integration:
1. Delete from `agent_env_vars`
2. Remove the section from TOOLS.md
3. If Google: delete `google_token.json` from workspace

---

## Files to Create / Modify

### New
- `/lib/tools-md-writer.ts` — section renderer + TOOLS.md patcher
- `/app/api/oauth/google/route.ts`
- `/app/api/oauth/google/callback/route.ts`

### Modify
- `/app/api/agents/[agentId]/env-vars/route.ts` — add `syncIntegrationToToolsMd` call after DB save
- `/app/[orgSlug]/agents/[agentId]/integrations/page.tsx` — change Google card to use OAuth button instead of key fields

---

## Estimated Build Time
1 session (tools-md-writer + env-vars patch + disconnect).
Google OAuth is another half session on its own.
