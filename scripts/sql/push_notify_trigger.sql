-- Push notification pipeline (portal Supabase: xqvnpcxyyxxxydescfzw)
-- Applied 2026-08-11 via Supabase Management API. This file is the source-of-truth copy.
--
-- Flow: INSERT on portal_messages → trigger → pg_net POST to /api/push/send
-- (x-webhook-secret header = SUPABASE_WEBHOOK_SECRET env var on the portal app).
-- The send route filters recipients per portal_channel_members.notify_mode:
--   'all' → every message | 'agents' → agent messages only (default/legacy)
--   'humans' → human messages only | 'none' → muted
-- Missing member row / null mode = 'agents'. The sender is never notified.

-- Per-channel notification preference column
ALTER TABLE portal_channel_members
  ADD COLUMN IF NOT EXISTS notify_mode text NOT NULL DEFAULT 'agents'
  CHECK (notify_mode IN ('all', 'agents', 'humans', 'none'));

-- Trigger function — fires webhook for BOTH agent and human messages
-- (per-recipient filtering happens in the API route, not here).
-- NOTE: pg_net only has net.http_post(text, jsonb, jsonb, jsonb, integer) —
-- body MUST be jsonb (jsonb_build_object/to_jsonb). The old version used
-- json_build_object (json), which failed silently inside the EXCEPTION handler.
CREATE OR REPLACE FUNCTION notify_push_on_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  IF NEW.sender_type IN ('agent', 'user') THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://portal.empowerbuilding.ai/api/push/send'::text,
        body := jsonb_build_object('record', to_jsonb(NEW)),
        headers := '{"Content-Type": "application/json", "x-webhook-secret": "<SUPABASE_WEBHOOK_SECRET>"}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Trigger (already exists in prod):
-- CREATE TRIGGER push_notify_trigger AFTER INSERT ON public.portal_messages
--   FOR EACH ROW EXECUTE FUNCTION notify_push_on_message();
