# PHASE 4 — Crons: Defaults + Natural Language

## Current State
The crons page is FULLY built:
- Lists all crons from `agent_cron_jobs` table
- Enable/disable/delete via API → `openclaw cron` CLI
- "New Automation" modal with Repeat / Custom / One-time schedule types
- Grouped by agent, deduplication logic, human-readable schedule display

**What's missing:**
1. Default crons aren't seeded when a new org launches (handled in Phase 1 provisioner)
2. No natural language input — user has to know cron expressions or the "every 2h" format

---

## Part A — Default Crons (done in Phase 1 Provisioner)

Seed these 3 crons on every new org provisioning:

```javascript
const DEFAULT_CRONS = [
  {
    name: "Morning Briefing",
    schedule: { type: 'cron', value: '0 8 * * 1-5' },
    message: "Send the morning briefing: today's priority leads, any follow-ups due, and anything urgent from yesterday.",
    tz: 'America/Chicago',
  },
  {
    name: "Inbox Scan",
    schedule: { type: 'every', value: '10m' },
    message: "Check Gmail for new emails from leads. For each new one, post a brief alert to the lead alerts channel.",
  },
  {
    name: "End-of-Day Report",
    schedule: { type: 'cron', value: '0 17 * * 1-5' },
    message: "Generate the end-of-day pipeline report: calls made, emails sent, new leads, and what needs follow-up tomorrow.",
    tz: 'America/Chicago',
  },
];
```

These fire via `openclaw cron add` in the provisioner (Phase 1, Step 6).

---

## Part B — Natural Language Cron Creation

### The UX
Add a plain-English input at the top of the "New Automation" modal:

> 💬 Describe what you want... (optional)
> "Send Larry a follow-up reminder every Tuesday at 10am"
> [Parse →]

On parse, the fields below auto-fill:
- Name → "Follow-up Reminder for Larry"
- Schedule Type → Custom (cron)
- Schedule Value → `0 10 * * 2`
- Message → "Send Larry a reminder to follow up on any leads he hasn't contacted in the past 3 days"

User can review/edit before hitting Create.

### Implementation

#### `/app/api/agents/[agentId]/crons/parse/route.ts` (new)
POST `{ text: string }` → `{ name, scheduleType, scheduleValue, message, tz }`

Calls Claude (or OpenAI) with a prompt like:
```
Parse this into a cron job spec:
"Send Larry a follow-up reminder every Tuesday at 10am"

Return JSON:
{
  "name": "human-readable name",
  "scheduleType": "every" | "cron" | "at",
  "scheduleValue": "cron expression or interval",
  "message": "what to tell the agent when this fires",
  "tz": "timezone if mentioned, else null"
}

Rules:
- scheduleType 'cron' for specific times/days
- scheduleType 'every' for intervals like "every 30 min"
- scheduleType 'at' for one-time future dates
- message should be a complete instruction to the agent, not just a summary
- If the user says "remind Larry", write the message as an instruction: "Remind Larry to follow up on..."
```

Using Claude claude-haiku or gpt-4o-mini for cost — this is a simple structured extraction.

#### `/app/[orgSlug]/crons/page.tsx` — Add NL input to modal
```tsx
// In AddCronModal, add at top:
const [nlText, setNlText] = useState('');
const [parsing, setParsing] = useState(false);

async function parseNL() {
  setParsing(true);
  const res = await fetch(`/api/agents/${agentId}/crons/parse`, {
    method: 'POST',
    body: JSON.stringify({ text: nlText }),
  });
  const data = await res.json();
  setName(data.name);
  setScheduleType(data.scheduleType);
  setScheduleValue(data.scheduleValue);
  setMessage(data.message);
  setParsing(false);
}
```

UI: text input → "Parse →" button → fields auto-fill below.
Fields remain editable after parse.

---

## Part C — Cron Edit (currently missing)

Right now you can enable/disable/delete but not edit an existing cron.

Add an edit button to each cron row that:
1. Opens the modal pre-filled with the cron's current name/schedule/message
2. On save: DELETE old + POST new (openclaw doesn't have a native edit command)

This is a minor addition — the delete + create flow is already wired.

---

## Files to Create / Modify

### New
- `/app/api/agents/[agentId]/crons/parse/route.ts` — NL → cron spec via Claude/GPT

### Modify
- `/app/[orgSlug]/crons/page.tsx` — Add NL input to AddCronModal, add edit button to rows

---

## Estimated Build Time
Half a session. The crons page is already built. NL parsing is a small API route + UI addition. Edit is just pre-filling the existing modal.
