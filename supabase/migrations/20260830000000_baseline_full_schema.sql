-- BASELINE: live portal schema captured 2026-08-29 EOD CDT (post S7/S9/S10/S11/S12/S14 — full RLS state, 27 tables + 27 policies).
-- Verified: applies clean to scratch postgres:17 (needs roles anon/authenticated/service_role + auth.uid() stub outside Supabase).
-- NOTE: includes portal_user_settings — supersedes 20260829030000_s7_portal_user_settings.sql on fresh environments.
--
-- PostgreSQL database dump
--

\restrict U3i8O9Q9NKIxLoyFnh2Ksg4qwycXAJSJoCPzfNj0Rp6D4NM57NSuM6w5HtETV7E

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: current_portal_user_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_portal_user_ids() RETURNS TABLE(user_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT id FROM portal_users pu WHERE pu.supabase_auth_id = auth.uid();
$$;


--
-- Name: current_user_is_org_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_is_org_admin(check_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_users pu
    WHERE pu.supabase_auth_id = auth.uid()
      AND pu.org_id = check_org_id
      AND pu.role IN ('owner','admin')
  );
$$;


--
-- Name: current_user_org_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_org_ids() RETURNS TABLE(org_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT DISTINCT pu.org_id FROM portal_users pu WHERE pu.supabase_auth_id = auth.uid();
$$;


--
-- Name: notify_atlas_lead_task(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_atlas_lead_task() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.channel_id = 'barnhaus-atlas-lead-alerts' AND NEW.sender_id = 'design-concierge' THEN BEGIN PERFORM net.http_post('https://n8n.empowerbuilding.ai/webhook/lXtylBI3tPMZxubr/webhook/atlas-lead-task'::text, json_build_object('content', NEW.content, 'channel_id', NEW.channel_id), '{}'::jsonb, '{"Content-Type": "application/json"}'::jsonb); EXCEPTION WHEN OTHERS THEN NULL; END; END IF; RETURN NEW; END; $$;


--
-- Name: notify_push_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_push_on_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ BEGIN IF NEW.sender_type IN ('agent', 'user') THEN BEGIN PERFORM net.http_post( url := 'https://portal.empowerbuilding.ai/api/push/send'::text, body := jsonb_build_object('record', to_jsonb(NEW)), headers := '{"Content-Type": "application/json", "x-webhook-secret": "d2f0fc18a3b0acbe8e14d9cb7c183776478f80e9cddb7ef6836a972e0010f683"}'::jsonb ); EXCEPTION WHEN OTHERS THEN NULL; END; END IF; RETURN NEW; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    agent_id uuid,
    agent_name text,
    session_id text,
    session_key text,
    run_id text,
    tool_name text,
    tool_meta text,
    assistant_text text,
    model_id text,
    provider text,
    event_ts timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_cron_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_cron_jobs (
    id text NOT NULL,
    agent_id uuid,
    agent_name text,
    org_id uuid,
    name text,
    enabled boolean,
    schedule_expr text,
    schedule_tz text,
    session_target text,
    wake_mode text,
    last_run_at_ms bigint,
    last_run_status text,
    last_delivered boolean,
    consecutive_errors integer,
    raw_payload jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    source text DEFAULT 'openclaw-cron'::text NOT NULL
);


--
-- Name: agent_env_vars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_env_vars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    key text NOT NULL,
    value_encrypted text DEFAULT ''::text,
    display_name text,
    is_secret boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    integration_id text,
    value text
);


--
-- Name: agent_file_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_file_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    filename text NOT NULL,
    content text NOT NULL,
    changed_by uuid,
    change_note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    emoji text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_templates (
    id text NOT NULL,
    display_name text NOT NULL,
    description text,
    icon text,
    default_soul_md text,
    default_agents_md text,
    default_tools_md text,
    default_memory_md text,
    default_heartbeat_md text,
    required_env_vars jsonb DEFAULT '[]'::jsonb,
    default_channels jsonb DEFAULT '[]'::jsonb,
    docker_image text,
    active boolean DEFAULT true,
    version integer DEFAULT 1,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_training_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_training_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id text NOT NULL,
    session_id text,
    session_key text,
    agent_name text NOT NULL,
    agent_id uuid,
    model_id text,
    provider text,
    prompt text,
    messages jsonb,
    system_prompt_hash text,
    system_prompt_chars integer,
    usage jsonb,
    final_status text,
    event_ts timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    template_id text,
    name text NOT NULL,
    display_name text NOT NULL,
    container_name text,
    container_status text DEFAULT 'stopped'::text,
    soul_md text,
    agents_md text,
    tools_md text,
    memory_md text,
    heartbeat_md text,
    template_version_deployed integer,
    active boolean DEFAULT true,
    last_health_check timestamp with time zone,
    deployed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    workspace_path text,
    server_host text DEFAULT '142.93.29.212'::text,
    ssh_key_secret text DEFAULT 'RESET_SSH_KEY'::text,
    telnyx_phone_number text,
    telnyx_connection_id text,
    reps jsonb DEFAULT '[]'::jsonb,
    group_id uuid,
    sms_gateway text DEFAULT 'telnyx'::text NOT NULL,
    textbee_api_url text,
    textbee_api_key text,
    textbee_phone_number text,
    textbee_device_id text,
    textbee_sim_slot integer DEFAULT 0,
    github_repo text,
    github_token text
);


--
-- Name: ceo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL
);


--
-- Name: feature_request_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_request_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    user_id uuid,
    user_name text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feature_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid,
    user_name text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    vote_count integer DEFAULT 1 NOT NULL,
    voter_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    brand_color text DEFAULT '#1a1a1a'::text,
    plan text DEFAULT 'starter'::text,
    active boolean DEFAULT true,
    trial_ends_at timestamp with time zone,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now(),
    crm_supabase_url text,
    crm_supabase_key text,
    crm_mode text DEFAULT 'b2b'::text,
    cross_sell_enabled boolean DEFAULT false NOT NULL,
    features text[] DEFAULT ARRAY[]::text[],
    sms_playbook text
);


--
-- Name: portal_channel_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_channel_members (
    channel_id text NOT NULL,
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone,
    notify_mode text DEFAULT 'agents'::text NOT NULL,
    CONSTRAINT portal_channel_members_notify_mode_check CHECK ((notify_mode = ANY (ARRAY['all'::text, 'agents'::text, 'humans'::text, 'none'::text])))
);


--
-- Name: portal_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_channels (
    id text NOT NULL,
    org_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    channel_type text NOT NULL,
    icon text,
    description text,
    "position" integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    group_id uuid,
    project_name text
);


--
-- Name: portal_context_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_context_stats (
    channel_id text NOT NULL,
    tokens bigint,
    ctx bigint,
    pct numeric,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: portal_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'rep'::text NOT NULL,
    invited_by uuid,
    token text DEFAULT (gen_random_uuid())::text NOT NULL,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    channel_ids text[]
);


--
-- Name: portal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id text NOT NULL,
    org_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id text,
    sender_name text,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    reply_to_id uuid,
    CONSTRAINT portal_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text])))
);


--
-- Name: portal_user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    signature_name text,
    signature_title text,
    signature_company text,
    signature_address text,
    signature_phone text,
    signature_website text,
    signature_disclaimer text,
    signature_extra_html text,
    briefing_time text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: portal_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    supabase_auth_id uuid,
    name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'rep'::text,
    avatar_url text,
    active boolean DEFAULT true,
    invited_at timestamp with time zone,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    last_active_at timestamp with time zone,
    crm_user_id uuid,
    default_channel_id text
);


--
-- Name: production_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id text NOT NULL,
    drafter text,
    plan_name text,
    client_name text,
    scope text,
    status text DEFAULT 'pending'::text,
    due_date date,
    render_url text,
    file_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT production_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'submitted'::text, 'approved'::text, 'revision'::text])))
);


--
-- Name: project_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_name text NOT NULL,
    filename text NOT NULL,
    version integer DEFAULT 1,
    file_url text NOT NULL,
    uploaded_by text,
    qa_status text DEFAULT 'pending'::text,
    qa_notes text,
    archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    org_id uuid,
    plan_slug text,
    file_key text,
    content_type text,
    file_size bigint,
    project_name text,
    contact_name text,
    tags text[] DEFAULT '{}'::text[],
    category text DEFAULT 'project'::text NOT NULL,
    folder_name text,
    CONSTRAINT project_files_category_check CHECK ((category = ANY (ARRAY['design'::text, 'project'::text]))),
    CONSTRAINT project_files_qa_status_check CHECK ((qa_status = ANY (ARRAY['pending'::text, 'passed'::text, 'issues'::text, 'skipped'::text])))
);


--
-- Name: provision_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provision_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    org_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    current_step text,
    steps_completed text[] DEFAULT '{}'::text[],
    error text,
    org_id uuid,
    agent_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: push_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    endpoint_tail text,
    title text,
    status text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: render_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.render_gallery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text NOT NULL,
    created_by text,
    profile_id text,
    org_id uuid,
    plan_name text,
    client_name text,
    tags text[],
    status text DEFAULT 'pending_review'::text,
    marketing_approved boolean DEFAULT false,
    channel_id text,
    task_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT render_gallery_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'revision'::text, 'in_use'::text])))
);


--
-- Name: transcription_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcription_jobs (
    id text NOT NULL,
    org_id uuid,
    agent_id uuid,
    portal_channel_id text,
    crm_supabase_url text,
    crm_supabase_key text,
    call_control_id text,
    call_session_id text,
    from_number text,
    recording_url text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    contact_id text,
    lead_name text,
    rep_name text,
    channel_id text,
    bot_token text,
    rep text,
    duration_str text,
    job_type text,
    meeting_title text,
    portal_org_id text,
    use_portal boolean DEFAULT false,
    direction text DEFAULT 'inbound'::text,
    call_recording_channel text
);


--
-- Name: v_training_actions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_training_actions AS
 SELECT id,
    agent_name,
    session_key,
    run_id,
    tool_name,
    tool_meta,
    assistant_text,
    model_id,
    event_ts
   FROM public.agent_action_log
  WHERE ((session_key ~~ 'agent:main:portal:channel:%'::text) AND (session_key !~~ '%:2026-06-28'::text))
  ORDER BY event_ts;


--
-- Name: v_training_messages; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_training_messages AS
 SELECT id,
    channel_id,
    org_id,
    sender_type,
    sender_name,
    content,
    attachments,
    metadata,
    created_at
   FROM public.portal_messages
  WHERE ((channel_id = ANY (ARRAY['barnhaus-vanessa-larry'::text, 'barnhaus-vanessa-shannon'::text, 'barnhaus-vanessa-larry-sms'::text, 'barnhaus-vanessa-shannon-sms'::text])) AND (sender_type = ANY (ARRAY['user'::text, 'agent'::text])) AND (created_at > '2026-06-29 00:00:00+00'::timestamp with time zone))
  ORDER BY created_at;


--
-- Name: voice_call_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_call_state (
    inbound_ccid text NOT NULL,
    org_id uuid,
    agent_id uuid,
    caller_phone text,
    caller_name text,
    contact_id text,
    rep_slug text,
    rep_name text,
    rep_channel_id text,
    rep_answered boolean DEFAULT false,
    missed_notified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_action_log agent_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_log
    ADD CONSTRAINT agent_action_log_pkey PRIMARY KEY (id);


--
-- Name: agent_cron_jobs agent_cron_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_cron_jobs
    ADD CONSTRAINT agent_cron_jobs_pkey PRIMARY KEY (id);


--
-- Name: agent_env_vars agent_env_vars_agent_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_env_vars
    ADD CONSTRAINT agent_env_vars_agent_id_key_key UNIQUE (agent_id, key);


--
-- Name: agent_env_vars agent_env_vars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_env_vars
    ADD CONSTRAINT agent_env_vars_pkey PRIMARY KEY (id);


--
-- Name: agent_file_history agent_file_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_file_history
    ADD CONSTRAINT agent_file_history_pkey PRIMARY KEY (id);


--
-- Name: agent_groups agent_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_groups
    ADD CONSTRAINT agent_groups_pkey PRIMARY KEY (id);


--
-- Name: agent_templates agent_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_templates
    ADD CONSTRAINT agent_templates_pkey PRIMARY KEY (id);


--
-- Name: agent_training_runs agent_training_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_runs
    ADD CONSTRAINT agent_training_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_training_runs agent_training_runs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_training_runs
    ADD CONSTRAINT agent_training_runs_run_id_key UNIQUE (run_id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: ceo_requests ceo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_requests
    ADD CONSTRAINT ceo_requests_pkey PRIMARY KEY (id);


--
-- Name: feature_request_comments feature_request_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_request_comments
    ADD CONSTRAINT feature_request_comments_pkey PRIMARY KEY (id);


--
-- Name: feature_requests feature_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: portal_channel_members portal_channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channel_members
    ADD CONSTRAINT portal_channel_members_pkey PRIMARY KEY (channel_id, user_id);


--
-- Name: portal_channels portal_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channels
    ADD CONSTRAINT portal_channels_pkey PRIMARY KEY (id);


--
-- Name: portal_context_stats portal_context_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_context_stats
    ADD CONSTRAINT portal_context_stats_pkey PRIMARY KEY (channel_id);


--
-- Name: portal_invites portal_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_invites
    ADD CONSTRAINT portal_invites_pkey PRIMARY KEY (id);


--
-- Name: portal_invites portal_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_invites
    ADD CONSTRAINT portal_invites_token_key UNIQUE (token);


--
-- Name: portal_messages portal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_pkey PRIMARY KEY (id);


--
-- Name: portal_user_settings portal_user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_settings
    ADD CONSTRAINT portal_user_settings_pkey PRIMARY KEY (id);


--
-- Name: portal_user_settings portal_user_settings_user_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_settings
    ADD CONSTRAINT portal_user_settings_user_id_org_id_key UNIQUE (user_id, org_id);


--
-- Name: portal_users portal_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_pkey PRIMARY KEY (id);


--
-- Name: portal_users portal_users_supabase_auth_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_supabase_auth_id_org_id_key UNIQUE (supabase_auth_id, org_id);


--
-- Name: production_tasks production_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_pkey PRIMARY KEY (id);


--
-- Name: project_files project_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id);


--
-- Name: provision_jobs provision_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provision_jobs
    ADD CONSTRAINT provision_jobs_pkey PRIMARY KEY (id);


--
-- Name: push_send_log push_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_send_log
    ADD CONSTRAINT push_send_log_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);


--
-- Name: render_gallery render_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_gallery
    ADD CONSTRAINT render_gallery_pkey PRIMARY KEY (id);


--
-- Name: transcription_jobs transcription_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_pkey PRIMARY KEY (id);


--
-- Name: voice_call_state voice_call_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_call_state
    ADD CONSTRAINT voice_call_state_pkey PRIMARY KEY (inbound_ccid);


--
-- Name: idx_agent_action_log_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_log_agent_id ON public.agent_action_log USING btree (agent_id);


--
-- Name: idx_agent_action_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_log_created_at ON public.agent_action_log USING btree (created_at DESC);


--
-- Name: idx_agent_action_log_event_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_log_event_ts ON public.agent_action_log USING btree (event_ts DESC);


--
-- Name: idx_agent_action_log_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_action_log_session_id ON public.agent_action_log USING btree (session_id);


--
-- Name: idx_agent_env_vars_agent_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_env_vars_agent_key ON public.agent_env_vars USING btree (agent_id, key);


--
-- Name: idx_agents_by_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_by_org ON public.agents USING btree (org_id);


--
-- Name: idx_atr_agent_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atr_agent_name ON public.agent_training_runs USING btree (agent_name);


--
-- Name: idx_atr_event_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atr_event_ts ON public.agent_training_runs USING btree (event_ts);


--
-- Name: idx_atr_session_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atr_session_key ON public.agent_training_runs USING btree (session_key);


--
-- Name: idx_channels_by_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channels_by_agent ON public.portal_channels USING btree (agent_id);


--
-- Name: idx_feature_requests_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feature_requests_org_id ON public.feature_requests USING btree (org_id);


--
-- Name: idx_feature_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feature_requests_status ON public.feature_requests USING btree (status);


--
-- Name: idx_frc_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_frc_request ON public.feature_request_comments USING btree (request_id, created_at);


--
-- Name: idx_messages_by_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_by_channel ON public.portal_messages USING btree (channel_id, created_at DESC);


--
-- Name: idx_messages_unprocessed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unprocessed ON public.portal_messages USING btree (channel_id, processed, created_at) WHERE ((sender_type = 'user'::text) AND (processed = false));


--
-- Name: idx_portal_invites_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_invites_org ON public.portal_invites USING btree (org_id);


--
-- Name: idx_portal_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_invites_token ON public.portal_invites USING btree (token);


--
-- Name: idx_project_files_org_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_org_project ON public.project_files USING btree (org_id, project_name) WHERE (archived = false);


--
-- Name: idx_project_files_project_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_project_name ON public.project_files USING btree (project_name);


--
-- Name: idx_push_send_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_send_log_created ON public.push_send_log USING btree (created_at DESC);


--
-- Name: idx_push_send_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_send_log_user ON public.push_send_log USING btree (user_id, created_at DESC);


--
-- Name: idx_transcription_jobs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcription_jobs_org ON public.transcription_jobs USING btree (org_id);


--
-- Name: provision_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provision_jobs_status_idx ON public.provision_jobs USING btree (status);


--
-- Name: transcription_jobs_call_session_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transcription_jobs_call_session_uniq ON public.transcription_jobs USING btree (call_session_id) WHERE (call_session_id IS NOT NULL);


--
-- Name: portal_messages atlas_lead_task_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER atlas_lead_task_trigger AFTER INSERT ON public.portal_messages FOR EACH ROW EXECUTE FUNCTION public.notify_atlas_lead_task();


--
-- Name: portal_messages push_notify_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER push_notify_trigger AFTER INSERT ON public.portal_messages FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_message();


--
-- Name: agent_action_log agent_action_log_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_action_log
    ADD CONSTRAINT agent_action_log_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: agent_env_vars agent_env_vars_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_env_vars
    ADD CONSTRAINT agent_env_vars_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_file_history agent_file_history_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_file_history
    ADD CONSTRAINT agent_file_history_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_file_history agent_file_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_file_history
    ADD CONSTRAINT agent_file_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.portal_users(id);


--
-- Name: agent_groups agent_groups_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_groups
    ADD CONSTRAINT agent_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: agents agents_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.agent_groups(id);


--
-- Name: agents agents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agents agents_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.agent_templates(id);


--
-- Name: feature_request_comments feature_request_comments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_request_comments
    ADD CONSTRAINT feature_request_comments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.feature_requests(id) ON DELETE CASCADE;


--
-- Name: feature_requests feature_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: feature_requests feature_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;


--
-- Name: portal_channel_members portal_channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channel_members
    ADD CONSTRAINT portal_channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.portal_channels(id) ON DELETE CASCADE;


--
-- Name: portal_channel_members portal_channel_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channel_members
    ADD CONSTRAINT portal_channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;


--
-- Name: portal_channels portal_channels_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channels
    ADD CONSTRAINT portal_channels_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: portal_channels portal_channels_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channels
    ADD CONSTRAINT portal_channels_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.agent_groups(id);


--
-- Name: portal_channels portal_channels_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_channels
    ADD CONSTRAINT portal_channels_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: portal_invites portal_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_invites
    ADD CONSTRAINT portal_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;


--
-- Name: portal_invites portal_invites_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_invites
    ADD CONSTRAINT portal_invites_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.portal_channels(id);


--
-- Name: portal_messages portal_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: portal_messages portal_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.portal_messages(id) ON DELETE SET NULL;


--
-- Name: portal_user_settings portal_user_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_settings
    ADD CONSTRAINT portal_user_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: portal_user_settings portal_user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_user_settings
    ADD CONSTRAINT portal_user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;


--
-- Name: portal_users portal_users_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_users
    ADD CONSTRAINT portal_users_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;


--
-- Name: render_gallery render_gallery_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_gallery
    ADD CONSTRAINT render_gallery_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: render_gallery render_gallery_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_gallery
    ADD CONSTRAINT render_gallery_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.production_tasks(id);


--
-- Name: transcription_jobs transcription_jobs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: transcription_jobs transcription_jobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_action_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_action_log ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_cron_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_cron_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_cron_jobs agent_cron_jobs_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_cron_jobs_org_member ON public.agent_cron_jobs TO authenticated USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))) WITH CHECK ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: agent_env_vars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_env_vars ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_file_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_file_history ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_file_history agent_file_history_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_file_history_insert_own ON public.agent_file_history FOR INSERT TO authenticated WITH CHECK ((changed_by IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE (portal_users.supabase_auth_id = auth.uid()))));


--
-- Name: agent_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: agents agent_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_member ON public.agents FOR SELECT USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: agent_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_training_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_training_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_channels channel_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channel_isolation ON public.portal_channels USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: portal_context_stats context_stats_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_stats_org_member ON public.portal_context_stats FOR SELECT TO authenticated USING ((channel_id IN ( SELECT portal_channels.id
   FROM public.portal_channels
  WHERE (portal_channels.org_id IN ( SELECT current_user_org_ids.org_id
           FROM public.current_user_org_ids() current_user_org_ids(org_id))))));


--
-- Name: feature_request_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_request_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_requests feature_requests_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_requests_org_member ON public.feature_requests TO authenticated USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))) WITH CHECK ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: feature_request_comments fr_comments_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_comments_org_member ON public.feature_request_comments TO authenticated USING ((request_id IN ( SELECT feature_requests.id
   FROM public.feature_requests
  WHERE (feature_requests.org_id IN ( SELECT current_user_org_ids.org_id
           FROM public.current_user_org_ids() current_user_org_ids(org_id)))))) WITH CHECK ((request_id IN ( SELECT feature_requests.id
   FROM public.feature_requests
  WHERE (feature_requests.org_id IN ( SELECT current_user_org_ids.org_id
           FROM public.current_user_org_ids() current_user_org_ids(org_id))))));


--
-- Name: agent_groups group_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_isolation ON public.agent_groups USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: portal_channel_members member_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_isolation ON public.portal_channel_members USING ((user_id IN ( SELECT current_portal_user_ids.user_id
   FROM public.current_portal_user_ids() current_portal_user_ids(user_id))));


--
-- Name: portal_messages message_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_delete ON public.portal_messages FOR DELETE USING ((channel_id IN ( SELECT pcm.channel_id
   FROM public.portal_channel_members pcm
  WHERE (pcm.user_id IN ( SELECT current_portal_user_ids.user_id
           FROM public.current_portal_user_ids() current_portal_user_ids(user_id))))));


--
-- Name: portal_messages message_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_read ON public.portal_messages FOR SELECT USING ((channel_id IN ( SELECT pcm.channel_id
   FROM public.portal_channel_members pcm
  WHERE (pcm.user_id IN ( SELECT current_portal_user_ids.user_id
           FROM public.current_portal_user_ids() current_portal_user_ids(user_id))))));


--
-- Name: portal_messages message_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_update ON public.portal_messages FOR UPDATE USING ((channel_id IN ( SELECT pcm.channel_id
   FROM public.portal_channel_members pcm
  WHERE (pcm.user_id IN ( SELECT current_portal_user_ids.user_id
           FROM public.current_portal_user_ids() current_portal_user_ids(user_id))))));


--
-- Name: portal_messages message_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_write ON public.portal_messages FOR INSERT WITH CHECK (((channel_id IN ( SELECT pcm.channel_id
   FROM public.portal_channel_members pcm
  WHERE (pcm.user_id IN ( SELECT current_portal_user_ids.user_id
           FROM public.current_portal_user_ids() current_portal_user_ids(user_id))))) AND (sender_type = ANY (ARRAY['user'::text, 'system'::text]))));


--
-- Name: organizations org_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_select_member ON public.organizations FOR SELECT USING ((id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: organizations org_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_update_admin ON public.organizations FOR UPDATE USING (public.current_user_is_org_admin(id)) WITH CHECK (public.current_user_is_org_admin(id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_channel_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_channel_members ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_context_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_context_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_invites portal_invites_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_invites_delete_admin ON public.portal_invites FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.supabase_auth_id = auth.uid()) AND (pu.org_id = portal_invites.org_id) AND (pu.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: portal_invites portal_invites_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_invites_insert_admin ON public.portal_invites FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.supabase_auth_id = auth.uid()) AND (pu.org_id = portal_invites.org_id) AND (pu.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: portal_invites portal_invites_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_invites_select_admin ON public.portal_invites FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.supabase_auth_id = auth.uid()) AND (pu.org_id = portal_invites.org_id) AND (pu.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: portal_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;

--
-- Name: production_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: project_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

--
-- Name: project_files project_files_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_files_org_member ON public.project_files TO authenticated USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))) WITH CHECK ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: provision_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provision_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: push_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: render_gallery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.render_gallery ENABLE ROW LEVEL SECURITY;

--
-- Name: render_gallery render_gallery_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY render_gallery_org_member ON public.render_gallery TO authenticated USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))) WITH CHECK ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: portal_invites service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.portal_invites TO service_role USING (true) WITH CHECK (true);


--
-- Name: transcription_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_users user_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_delete_admin ON public.portal_users FOR DELETE USING (public.current_user_is_org_admin(org_id));


--
-- Name: portal_users user_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_select_member ON public.portal_users FOR SELECT USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: portal_user_settings user_settings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_insert_own ON public.portal_user_settings FOR INSERT WITH CHECK (((user_id IN ( SELECT current_portal_user_ids.user_id
   FROM public.current_portal_user_ids() current_portal_user_ids(user_id))) AND (org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))));


--
-- Name: portal_user_settings user_settings_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_select_member ON public.portal_user_settings FOR SELECT USING ((org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id))));


--
-- Name: portal_user_settings user_settings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_update_own ON public.portal_user_settings FOR UPDATE USING ((user_id IN ( SELECT current_portal_user_ids.user_id
   FROM public.current_portal_user_ids() current_portal_user_ids(user_id)))) WITH CHECK (((user_id IN ( SELECT current_portal_user_ids.user_id
   FROM public.current_portal_user_ids() current_portal_user_ids(user_id))) AND (org_id IN ( SELECT current_user_org_ids.org_id
   FROM public.current_user_org_ids() current_user_org_ids(org_id)))));


--
-- Name: portal_users user_update_own_heartbeat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_update_own_heartbeat ON public.portal_users FOR UPDATE TO authenticated USING ((supabase_auth_id = auth.uid())) WITH CHECK ((supabase_auth_id = auth.uid()));


--
-- Name: voice_call_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_call_state ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict U3i8O9Q9NKIxLoyFnh2Ksg4qwycXAJSJoCPzfNj0Rp6D4NM57NSuM6w5HtETV7E

