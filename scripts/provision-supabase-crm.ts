/**
 * provision-supabase-crm.ts
 *
 * Auto-provisions a new Supabase project for a new org's CRM.
 * Creates the project, waits for it to be active, applies the CRM schema,
 * and returns the project URL + service role key.
 *
 * Called by provision-org.ts during org setup.
 */

const SUPABASE_MGMT_API_KEY = process.env.SUPABASE_MANAGEMENT_API_KEY!;
const SUPABASE_ORG_ID       = 'qteajehqknrnpxvsbcem'; // Empowerbuilding's Org
const SUPABASE_REGION       = 'us-east-1';
const SUPABASE_PLAN         = 'free';

const MGMT_BASE = 'https://api.supabase.com/v1';

export interface CrmProvisionResult {
  projectRef:      string;
  supabaseUrl:     string;
  serviceRoleKey:  string;
  dbPassword:      string;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const CRM_SCHEMA_SQL = `
-- ── users (reps) ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  name       text        NOT NULL,
  avatar_url text,
  role       text        NOT NULL DEFAULT 'sales',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['admin','sales']))
);

-- ── contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          text        NOT NULL DEFAULT '',
  last_name           text        NOT NULL DEFAULT '',
  email               text,
  phone               text,
  lead_source         text,
  notes               text,
  client_type         text        DEFAULT 'consumer',
  lifecycle_stage     text        NOT NULL DEFAULT 'subscriber',
  owner_id            uuid        REFERENCES public.users(id),
  lead_score          text,
  lead_score_reason   text,
  lead_score_updated_at timestamptz,
  last_contacted_at   timestamptz,
  last_contact_type   text,
  unsubscribed        boolean     NOT NULL DEFAULT false,
  unsubscribed_at     timestamptz,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  fbclid              text,
  anonymous_id        text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT contacts_lifecycle_stage_check CHECK (
    lifecycle_stage = ANY (ARRAY[
      'subscriber','lead','mql','sql','opportunity','customer','churned'
    ])
  ),
  CONSTRAINT contacts_client_type_check CHECK (
    client_type = ANY (ARRAY['builder','consumer','subcontractor','other'])
  )
);

-- ── activities ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid        REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_type text        NOT NULL,
  title         text        NOT NULL,
  description   text,
  metadata      jsonb,
  anonymous_id  text,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT activities_type_check CHECK (
    activity_type = ANY (ARRAY[
      'page_view','form_submit','email_sent','email_received',
      'sms_sent','sms_received','call','note','meeting_scheduled',
      'contact_created','cost_calc'
    ])
  )
);

-- ── tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid        REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_to  uuid        REFERENCES public.users(id),
  created_by   uuid        REFERENCES public.users(id),
  title        text        NOT NULL,
  description  text,
  priority     text        NOT NULL DEFAULT 'medium',
  task_type    text        NOT NULL DEFAULT 'to_do',
  due_date     date,
  due_time     time,
  completed    boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,
  status       text        NOT NULL DEFAULT 'open',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT tasks_priority_check CHECK (
    priority = ANY (ARRAY['low','medium','high','urgent'])
  ),
  CONSTRAINT tasks_task_type_check CHECK (
    task_type = ANY (ARRAY['to_do','call','email','meeting'])
  ),
  CONSTRAINT tasks_status_check CHECK (
    status = ANY (ARRAY['open','awaiting_reply','snoozed','completed','cancelled'])
  )
);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS contacts_email_idx    ON public.contacts(lower(email));
CREATE INDEX IF NOT EXISTS contacts_phone_idx    ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS contacts_owner_idx    ON public.contacts(owner_id);
CREATE INDEX IF NOT EXISTS activities_contact_idx ON public.activities(contact_id);
CREATE INDEX IF NOT EXISTS activities_type_idx    ON public.activities(activity_type);
CREATE INDEX IF NOT EXISTS tasks_contact_idx      ON public.tasks(contact_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_idx     ON public.tasks(assigned_to);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ── deals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid        REFERENCES public.contacts(id) ON DELETE CASCADE,
  owner_id          uuid        REFERENCES public.users(id),
  title             text        NOT NULL,
  value             numeric(12,2),
  stage             text        NOT NULL DEFAULT 'discovery',
  actual_close_date date,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT deals_stage_check CHECK (
    stage = ANY (ARRAY['discovery','qualified','proposal_sent','negotiation','won','lost'])
  )
);

-- ── notes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid        REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_id  uuid        REFERENCES public.users(id),
  body       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── call_transcripts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  owner_id        uuid        REFERENCES public.users(id),
  transcript_text text,
  summary         text,
  duration_secs   integer,
  recording_url   text,
  total_words     integer,
  client_words    integer,
  created_at      timestamptz DEFAULT now()
);

-- ── transcription_jobs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcription_jobs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_ai_id      text        UNIQUE,
  contact_id          uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'queued',
  recording_url       text,
  crm_supabase_url    text,
  crm_supabase_key    text,
  created_at          timestamptz DEFAULT now()
);

-- ── agent_tokens (QB + long-lived OAuth) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tokens (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ── additional indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS deals_contact_idx      ON public.deals(contact_id);
CREATE INDEX IF NOT EXISTS deals_owner_idx        ON public.deals(owner_id);
CREATE INDEX IF NOT EXISTS notes_contact_idx      ON public.notes(contact_id);
CREATE INDEX IF NOT EXISTS transcripts_contact_idx ON public.call_transcripts(contact_id);
CREATE INDEX IF NOT EXISTS txjobs_assembly_idx    ON public.transcription_jobs(assembly_ai_id);

-- ── updated_at trigger for deals ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_deals_updated_at ON public.deals;
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ── RLS (disable for service role usage) ─────────────────────────────────────
ALTER TABLE public.contacts          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcripts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcription_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tokens      DISABLE ROW LEVEL SECURITY;
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mgmt(method: string, path: string, body?: object) {
  const res = await fetch(`${MGMT_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SUPABASE_MGMT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase MGMT ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

function generateDbPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function provisionSupabaseCrm(orgSlug: string): Promise<CrmProvisionResult> {
  if (!SUPABASE_MGMT_API_KEY) {
    throw new Error('SUPABASE_MANAGEMENT_API_KEY env var not set');
  }

  const projectName = `crm-${orgSlug}`;
  const dbPassword  = generateDbPassword();

  // ── 1. Create project ───────────────────────────────────────────────────────
  console.log(`[crm-provision] Creating Supabase project: ${projectName}`);
  const project = await mgmt('POST', '/projects', {
    name:         projectName,
    db_pass:      dbPassword,
    region:       SUPABASE_REGION,
    plan:         SUPABASE_PLAN,
    organization_id: SUPABASE_ORG_ID,
  }) as { id: string; ref: string; status: string };

  const ref = project.ref;
  console.log(`[crm-provision] Project created: ${ref}`);

  // ── 2. Wait for project to become ACTIVE (max 3 min) ───────────────────────
  console.log(`[crm-provision] Waiting for project ${ref} to become active...`);
  let active = false;
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await mgmt('GET', `/projects/${ref}`) as { status: string };
    console.log(`[crm-provision] Status: ${status.status} (${(i + 1) * 5}s)`);
    if (status.status === 'ACTIVE_HEALTHY') { active = true; break; }
  }
  if (!active) throw new Error(`Project ${ref} did not become active within 3 minutes`);

  // ── 3. Get service role key ─────────────────────────────────────────────────
  const keys = await mgmt('GET', `/projects/${ref}/api-keys`) as Array<{ name: string; api_key: string }>;
  const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
  if (!serviceKey) throw new Error(`Could not find service_role key for project ${ref}`);

  // ── 4. Apply CRM schema ─────────────────────────────────────────────────────
  console.log(`[crm-provision] Applying CRM schema to ${ref}`);
  await mgmt('POST', `/projects/${ref}/database/query`, { query: CRM_SCHEMA_SQL });
  console.log(`[crm-provision] Schema applied`);

  const supabaseUrl = `https://${ref}.supabase.co`;

  return {
    projectRef:     ref,
    supabaseUrl,
    serviceRoleKey: serviceKey,
    dbPassword,
  };
}
