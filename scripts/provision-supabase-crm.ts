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
-- ═══════════════════════════════════════════════════════════════
-- CRM Schema — based on Showcase Builders (generic, no Barnhaus-specific tables)
-- ═══════════════════════════════════════════════════════════════

-- Required for trigger functions that make HTTP calls (notify_deal_complete, etc.)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Functions & Trigger Procedures ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contacts_normalize_phone_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone := normalize_phone(NEW.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_words(txt text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF txt IS NULL OR trim(txt) = '' THEN RETURN 0; END IF;
  RETURN array_length(regexp_split_to_array(trim(txt), '\s+'), 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO activities (contact_id, deal_id, activity_type, title, metadata, created_at)
    VALUES (
      NEW.contact_id, NEW.id, 'deal_stage_changed',
      'Deal stage changed: ' || COALESCE(OLD.stage, 'none') || ' -> ' || COALESCE(NEW.stage, 'none'),
      jsonb_build_object('from_stage', OLD.stage, 'to_stage', NEW.stage, 'deal_title', NEW.title, 'owner_id', NEW.owner_id),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_meeting_scheduled()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN   INSERT INTO activities (contact_id, activity_type, title, metadata, created_at)   VALUES (     NEW.contact_id,     'meeting_scheduled',     'Meeting scheduled: ' || COALESCE(NEW.guest_first_name, 'Guest') || ' ' || COALESCE(NEW.guest_last_name, ''),     jsonb_build_object(       'start_time', NEW.start_time,       'end_time', NEW.end_time,       'meeting_type_id', NEW.meeting_type_id,       'source', NEW.source,       'google_meet_link', NEW.google_meet_link     ),     NOW()   );   RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE digits TEXT;
BEGIN
  IF p IS NULL OR p = '' THEN RETURN p; END IF;
  digits := regexp_replace(p, '[^0-9]', '', 'g');
  IF length(digits) = 10 THEN RETURN '+1' || digits;
  ELSIF length(digits) = 11 AND left(digits, 1) = '1' THEN RETURN '+' || digits;
  ELSE RETURN p;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_deal_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE payload jsonb; BEGIN IF (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'completed') THEN payload := jsonb_build_object('org', '{{ORG_SLUG}}', 'record', row_to_json(NEW)::jsonb, 'old_record', row_to_json(OLD)::jsonb); PERFORM net.http_post(url := 'https://n8n.empowerbuilding.ai/webhook/deal-complete-capi', body := payload, headers := '{"Content-Type": "application/json"}'::jsonb); END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.recalculate_word_counts(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total INTEGER := 0;
  v_client INTEGER := 0;
  v_trans_total INTEGER := 0;
  v_trans_client INTEGER := 0;
BEGIN
  SELECT
    COALESCE(SUM(count_words(description)), 0),
    COALESCE(SUM(CASE WHEN activity_type IN ('email_received','reply_received','inbound_email','sms_received') THEN count_words(description) ELSE 0 END), 0)
  INTO v_total, v_client
  FROM activities
  WHERE contact_id = p_contact_id
    AND activity_type IN ('email_sent','email_received','reply_received','inbound_email','sms_sent','sms_received','note');

  SELECT COALESCE(SUM(total_words), 0), COALESCE(SUM(client_words), 0)
  INTO v_trans_total, v_trans_client
  FROM call_transcripts
  WHERE contact_id = p_contact_id;

  UPDATE contacts
  SET total_word_count = v_total + v_trans_total,
      client_word_count = v_client + v_trans_client
  WHERE id = p_contact_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_validate_won_deal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.stage = 'complete' THEN
    IF NEW.actual_close_date IS NULL THEN
      RAISE EXCEPTION 'MISSING_CLOSE_DATE: Close date is required when marking a deal as Won.';
    END IF;
    IF NEW.value IS NULL OR NEW.value <= 0 THEN
      RAISE EXCEPTION 'MISSING_REVENUE: Revenue amount is required when marking a deal as Won.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_word_count_activity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_cid UUID;
BEGIN
  v_cid := COALESCE(NEW.contact_id, OLD.contact_id);
  IF v_cid IS NOT NULL THEN
    PERFORM recalculate_word_counts(v_cid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_word_count_transcript()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_cid UUID;
BEGIN
  v_cid := COALESCE(NEW.contact_id, OLD.contact_id);
  IF v_cid IS NOT NULL THEN
    PERFORM recalculate_word_counts(v_cid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_agent_tokens_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.update_last_contacted_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE contacts
  SET last_contacted_at = NEW.created_at
  WHERE id = NEW.contact_id
    AND (last_contacted_at IS NULL OR NEW.created_at > last_contacted_at);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ── Tables ───────────────────────────────────────────────────────────────────────

-- ── users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  email  text  NOT NULL,
  name  text  NOT NULL,
  avatar_url  text,
  role  text  DEFAULT 'sales'::text  NOT NULL,
  created_at  timestamptz  DEFAULT now()
);

-- ── companies ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  name  text  NOT NULL,
  type  text  NOT NULL,
  website  text,
  address  text,
  city  text,
  state  text,
  phone  text,
  notes  text,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now()
);

-- ── contacts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  company_id  uuid,
  first_name  text  NOT NULL,
  last_name  text  NOT NULL,
  email  text,
  phone  text,
  role  text,
  is_primary  boolean  DEFAULT false,
  lead_source  text,
  notes  text,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  client_type  text,
  fbclid  text,
  anonymous_id  text,
  lifecycle_stage  text  DEFAULT 'subscriber'::text,
  fb_events_sent  jsonb  DEFAULT '{}'::jsonb,
  fb_lead_id  text,
  unsubscribed  boolean  DEFAULT false  NOT NULL,
  unsubscribed_at  timestamptz,
  fbp  text,
  client_ip_address  text,
  client_user_agent  text,
  owner_id  uuid,
  lead_score  text,
  lead_score_reason  text,
  lead_score_updated_at  timestamptz,
  utm_source  text,
  utm_medium  text,
  utm_campaign  text,
  utm_content  text,
  utm_term  text,
  trestle_line_type  text,
  trestle_carrier  text,
  trestle_is_prepaid  boolean,
  trestle_is_commercial  boolean,
  trestle_owner_name  text,
  trestle_owner_type  text,
  trestle_owner_age_range  text,
  trestle_owner_gender  text,
  trestle_address  text,
  trestle_city  text,
  trestle_state  text,
  trestle_zip  text,
  trestle_emails  text[],
  trestle_enriched_at  timestamptz,
  attom_avm_value  integer,
  attom_avm_high  integer,
  attom_avm_low  integer,
  attom_avm_score  integer,
  attom_lot_acres  numeric,
  attom_sqft  integer,
  attom_beds  integer,
  attom_baths  numeric,
  attom_year_built  integer,
  attom_owner_occupied  boolean,
  attom_prop_type  text,
  attom_last_sale_price  integer,
  attom_last_sale_date  text,
  attom_enriched_at  timestamptz,
  whale_score  integer  DEFAULT 0,
  whale_tier  text,
  project_stage  text,
  last_contacted_at  timestamptz,
  last_contact_type  text,
  fbc  text,
  last_sms_rep  text,
  total_word_count  integer  DEFAULT 0,
  client_word_count  integer  DEFAULT 0,
  job_title  text,
  employer  text,
  linkedin_url  text,
  pdl_enriched_at  timestamptz,
  pdl_location  text,
  pdl_birth_year  integer,
  pdl_education  text
);

-- ── activities ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  contact_id  uuid,
  deal_id  uuid,
  company_id  uuid,
  user_id  uuid,
  activity_type  text  NOT NULL,
  title  text  NOT NULL,
  description  text,
  metadata  jsonb,
  anonymous_id  text,
  created_at  timestamptz  DEFAULT now()
);

-- ── tasks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  contact_id  uuid,
  deal_id  uuid,
  company_id  uuid,
  assigned_to  uuid,
  created_by  uuid,
  title  text  NOT NULL,
  description  text,
  priority  text  DEFAULT 'medium'::text  NOT NULL,
  task_type  text  DEFAULT 'to_do'::text  NOT NULL,
  due_date  date,
  due_time  time without time zone,
  reminder_at  timestamptz,
  completed  boolean  DEFAULT false  NOT NULL,
  completed_at  timestamptz,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  status  text,
  ai_summary  text
);

-- ── deals ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deals (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  company_id  uuid,
  contact_id  uuid,
  title  text  NOT NULL,
  value  numeric,
  stage  text  DEFAULT 'new_lead'::text  NOT NULL,
  deal_type  text,
  probability  integer,
  expected_close_date  date,
  actual_close_date  date,
  lost_reason  text,
  notes  text,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  owner_id  uuid,
  sales_type  text
);

-- ── notes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  contact_id  uuid,
  deal_id  uuid,
  company_id  uuid,
  task_id  uuid,
  content  text  NOT NULL,
  created_by  uuid,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now()
);

-- ── call_transcripts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  contact_id  uuid,
  transcript_id  text,
  rep  text,
  lead_name  text,
  duration_str  text,
  recording_url  text,
  full_text  text,
  storage_url  text,
  created_at  timestamptz  DEFAULT now(),
  summary  text,
  total_words  integer,
  client_words  integer
);

-- ── transcription_jobs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcription_jobs (
  id  text  NOT NULL,
  channel_id  text,
  bot_token  text,
  lead_name  text,
  meeting_title  text,
  created_at  timestamptz  DEFAULT now(),
  rep_name  text,
  rep  text,
  duration_str  text,
  contact_id  text,
  job_type  text
);

-- ── agent_tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tokens (
  key  text  NOT NULL,
  value  jsonb  NOT NULL,
  updated_at  timestamptz  DEFAULT now()
);

-- ── calendar_integrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  user_id  uuid  NOT NULL,
  provider  text  DEFAULT 'google'::text  NOT NULL,
  email_address  text  NOT NULL,
  access_token  text  NOT NULL,
  refresh_token  text,
  token_expires_at  timestamptz,
  calendar_id  text  DEFAULT 'primary'::text,
  is_active  boolean  DEFAULT true,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now()
);

-- ── facebook_integrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.facebook_integrations (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  user_id  uuid  NOT NULL,
  page_id  text,
  page_name  text,
  access_token  text  NOT NULL,
  token_expires_at  timestamptz,
  permissions  text[],
  is_active  boolean  DEFAULT true,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  ad_account_id  text
);

-- ── linked_deals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linked_deals (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  deal_id  uuid  NOT NULL,
  linked_deal_id  uuid  NOT NULL,
  relationship_type  text  NOT NULL,
  created_at  timestamptz  DEFAULT now()
);

-- ── deal_value_history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_value_history (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  deal_id  uuid  NOT NULL,
  value  numeric  NOT NULL,
  note  text,
  created_at  timestamptz  DEFAULT now()
);

-- ── meeting_types ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_types (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  user_id  uuid  NOT NULL,
  slug  text  NOT NULL,
  title  text  NOT NULL,
  description  text,
  duration_minutes  integer  DEFAULT 30  NOT NULL,
  buffer_before  integer  DEFAULT 0,
  buffer_after  integer  DEFAULT 15,
  availability_start  time without time zone  DEFAULT '08:00:00'::time without time zone,
  availability_end  time without time zone  DEFAULT '17:00:00'::time without time zone,
  available_days  text[]  DEFAULT '{1,2,3,4,5}'::integer[],
  timezone  text  DEFAULT 'America/Chicago'::text,
  max_days_ahead  integer  DEFAULT 60,
  min_notice_hours  integer  DEFAULT 4,
  is_active  boolean  DEFAULT true,
  location_type  text  DEFAULT 'phone'::text,
  custom_location  text,
  custom_fields  jsonb  DEFAULT '[]'::jsonb,
  confirmation_message  text,
  brand_color  text  DEFAULT '#2d3748'::text,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  logo_url  text
);

-- ── scheduled_meetings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_meetings (
  id  uuid  DEFAULT gen_random_uuid()  NOT NULL,
  meeting_type_id  uuid,
  host_user_id  uuid  NOT NULL,
  contact_id  uuid,
  guest_first_name  text  NOT NULL,
  guest_last_name  text  NOT NULL,
  guest_email  text  NOT NULL,
  guest_phone  text,
  guest_notes  text,
  custom_field_responses  jsonb  DEFAULT '{}'::jsonb,
  start_time  timestamptz  NOT NULL,
  end_time  timestamptz  NOT NULL,
  timezone  text  NOT NULL,
  google_event_id  text,
  google_meet_link  text,
  status  text  DEFAULT 'scheduled'::text,
  cancelled_at  timestamptz,
  cancellation_reason  text,
  rescheduled_from  uuid,
  anonymous_id  text,
  source  text,
  utm_source  text,
  utm_medium  text,
  utm_campaign  text,
  reminder_sent_at  timestamptz,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  confirmation_sent_at  timestamptz,
  reminder_3hr_sent_at  timestamptz,
  reminder_30min_sent_at  timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS calendar_integrations_user_id_provider_key ON public.calendar_integrations USING btree (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user_id ON public.calendar_integrations USING btree (user_id);
CREATE INDEX IF NOT EXISTS facebook_integrations_user_id_key ON public.facebook_integrations USING btree (user_id);
CREATE INDEX IF NOT EXISTS meeting_types_slug_key ON public.meeting_types USING btree (slug);
CREATE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);

-- ── Triggers ─────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_word_count_activities ON public.activities;
CREATE TRIGGER trg_word_count_activities AFTER INSERT OR DELETE OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION trg_fn_word_count_activity();

DROP TRIGGER IF EXISTS trg_agent_tokens_updated_at ON public.agent_tokens;
CREATE TRIGGER trg_agent_tokens_updated_at BEFORE UPDATE ON public.agent_tokens FOR EACH ROW EXECUTE FUNCTION update_agent_tokens_updated_at();

DROP TRIGGER IF EXISTS update_calendar_integrations_updated_at ON public.calendar_integrations;
CREATE TRIGGER update_calendar_integrations_updated_at BEFORE UPDATE ON public.calendar_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_word_count_transcripts ON public.call_transcripts;
CREATE TRIGGER trg_word_count_transcripts AFTER INSERT OR DELETE OR UPDATE ON public.call_transcripts FOR EACH ROW EXECUTE FUNCTION trg_fn_word_count_transcript();

DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.contacts;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION contacts_normalize_phone_trigger();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS deal_stage_change_trigger ON public.deals;
CREATE TRIGGER deal_stage_change_trigger AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

DROP TRIGGER IF EXISTS trg_deal_complete_capi ON public.deals;
CREATE TRIGGER trg_deal_complete_capi AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION notify_deal_complete();

DROP TRIGGER IF EXISTS trg_validate_won_deal ON public.deals;
CREATE TRIGGER trg_validate_won_deal BEFORE INSERT OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_won_deal();

DROP TRIGGER IF EXISTS update_deals_updated_at ON public.deals;
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meeting_types_updated_at ON public.meeting_types;
CREATE TRIGGER update_meeting_types_updated_at BEFORE UPDATE ON public.meeting_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_notes_update_last_contacted ON public.notes;
CREATE TRIGGER trg_notes_update_last_contacted AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION update_last_contacted_at();

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS meeting_scheduled_trigger ON public.scheduled_meetings;
CREATE TRIGGER meeting_scheduled_trigger AFTER INSERT ON public.scheduled_meetings FOR EACH ROW EXECUTE FUNCTION log_meeting_scheduled();

DROP TRIGGER IF EXISTS update_scheduled_meetings_updated_at ON public.scheduled_meetings;
CREATE TRIGGER update_scheduled_meetings_updated_at BEFORE UPDATE ON public.scheduled_meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Disable RLS (service role usage) ─────────────────────────────────────────────

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcription_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_deals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_value_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_meetings DISABLE ROW LEVEL SECURITY;
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
  const schemaWithOrg = CRM_SCHEMA_SQL.replace(/\{\{ORG_SLUG\}\}/g, orgSlug);
  await mgmt('POST', `/projects/${ref}/database/query`, { query: schemaWithOrg });
  console.log(`[crm-provision] Schema applied`);

  const supabaseUrl = `https://${ref}.supabase.co`;

  return {
    projectRef:     ref,
    supabaseUrl,
    serviceRoleKey: serviceKey,
    dbPassword,
  };
}
