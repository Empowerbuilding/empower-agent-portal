# PHASE 2 — Onboarding Wizard

## Goal
A multi-step UI flow that a new customer goes through after signup. At the end, their agent is live with personalized bootstrap files. Calls the Phase 1 provisioner under the hood.

## Route
`/onboarding` — unscoped (before org exists)
Or: `/setup` after first login if org has no `setup_complete` flag

---

## Wizard Steps (in order)

### Step 1 — Company Info
Fields:
- Company name (required)
- Industry (dropdown: Home Building, General Contracting, Real Estate, Custom Homes, Other)
- What do you sell? (textarea: "custom steel barndominium homes ranging from 1,500–5,000 sq ft")
- Website URL (optional)
- Phone number (optional — used as agent's outbound caller ID)

Writes to: `SOUL.md`, `AGENTS.md` header, `USER.md`

### Step 2 — Agent Setup
Fields:
- Agent name (default: "Vanessa") — what your team will call her
- Agent role description (default: "inside sales agent") — one line
- What should she focus on? (checkboxes: qualify leads, schedule calls, send follow-up emails, handle SMS, build proposals)
- Brand voice (radio: Professional, Friendly & conversational, Direct & fast)

Writes to: `SOUL.md`, `IDENTITY.md`

### Step 3 — Team Setup
Add reps (at least 1 required):
- Name, email, phone (optional)
- Role label (e.g. "Sales Rep", "Account Executive")
- Add up to 5 reps

Writes to: `AGENTS.md` (rep routing rules), `USER.md` (team section), `TOOLS.md` (email accounts section)

### Step 4 — Integrations (Quick Connect)
Show 4 core integrations with a "Connect" button each:
- **Gmail** — OAuth popup → stores token → writes to TOOLS.md
- **Phone (Telnyx)** — Paste API key → auto-provisions a number → writes to TOOLS.md
- **CRM** — Use built-in (auto-provisioned Supabase) OR paste HubSpot/Salesforce key
- **Calendar** — Google Calendar (piggybacked on Gmail OAuth)

All optional — can skip and connect later in Settings → Integrations.

### Step 5 — Automations
Show 3 default crons with on/off toggles:
- ✅ Morning briefing (weekdays 8am)
- ✅ Email inbox scan (every 10 min)
- ✅ End-of-day pipeline report (weekdays 5pm)

Optional: type a custom automation in plain English
→ "Also remind the team about uncalled leads every Tuesday at noon"
→ Preview shows: "Every Tuesday at 12:00 PM CST — Remind the team about leads that haven't been called yet"

### Step 6 — Review & Launch
Summary card showing:
- Company: [name]
- Agent: [name], [role]
- Team: [rep1], [rep2]
- Integrations: Gmail ✓, Phone ✓, CRM built-in
- Automations: 3 default + 1 custom

Big "Launch Agent" button.

On click:
1. POST `/api/provision` with all wizard data
2. Show progress: "Creating workspace… Starting container… Seeding automations… Done ✓"
3. Redirect to `/{orgSlug}/general` — the main chat channel

---

## Files to Create

### `/app/onboarding/page.tsx`
Main wizard shell. Manages step state, form data, submission.

### `/app/onboarding/steps/CompanyStep.tsx`
### `/app/onboarding/steps/AgentStep.tsx`
### `/app/onboarding/steps/TeamStep.tsx`
### `/app/onboarding/steps/IntegrationsStep.tsx`
### `/app/onboarding/steps/AutomationsStep.tsx`
### `/app/onboarding/steps/ReviewStep.tsx`

### `/lib/bootstrap-writer.ts`
Takes wizard answers → returns complete text for each bootstrap file.
Called by the provisioner after org/container setup.

```typescript
export function generateSOUL(answers: WizardAnswers): string
export function generateAGENTS(answers: WizardAnswers): string
export function generateTOOLS(answers: WizardAnswers): string
export function generateUSER(answers: WizardAnswers): string
export function generateIDENTITY(answers: WizardAnswers): string
```

### `/app/api/provision/route.ts`
POST — accepts wizard payload, calls provisioner, returns `{ orgId, orgSlug, agentId }`.

---

## UX Notes
- Progress bar at top (Steps 1–6)
- Each step has a "Back" button
- Data is accumulated in React state across steps (not saved per step)
- Only one network call happens: at the very end on "Launch Agent"
- Whole wizard should feel like Notion/Linear onboarding — clean, fast, not overwhelming
- Don't make them fill in what they can configure later — wizard should be minimal
- "Connect" buttons in Step 4 can open OAuth popups or inline key entry; skip links are prominent

---

## Estimated Build Time
1–2 sessions. The wizard UI is mechanical (forms + state). The interesting part is `bootstrap-writer.ts` — generating good bootstrap file content from answers. That's the quality lever.
