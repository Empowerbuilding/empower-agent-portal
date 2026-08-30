-- S25: Resend delivery log (applied live 2026-08-29; this file documents it)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_domains text[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id text UNIQUE NOT NULL,
  org_id uuid REFERENCES organizations(id),
  from_addr text,
  to_addrs text[],
  subject text,
  last_event text NOT NULL,
  bounce_message text,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  first_event_at timestamptz DEFAULT now(),
  last_event_at timestamptz DEFAULT now(),
  events jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_deliveries_org_time ON email_deliveries(org_id, last_event_at DESC);

ALTER TABLE email_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_deliveries_org_read ON email_deliveries;
CREATE POLICY email_deliveries_org_read ON email_deliveries
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM current_user_org_ids()));

-- Seed org sender domains (adjust per org as domains are added):
-- UPDATE organizations SET email_domains='{barnhaussteelbuilders.com,empowerbuilding.ai,moderndwellings.com,cw-custombuilders.com}' WHERE slug='barnhaus';
-- UPDATE organizations SET email_domains='{showcasebuilders.com}' WHERE slug='showcase';
-- UPDATE organizations SET email_domains='{its-training.com}' WHERE slug='its-training';
