-- S24: per-message model picker (applied live 2026-08-30; this file documents it)
CREATE TABLE IF NOT EXISTS model_tiers (
  tier text PRIMARY KEY,
  label text NOT NULL,
  emoji text NOT NULL,
  model_id text NOT NULL,          -- 'default' = clear session pin (agent's configured model)
  fallback_model_id text,
  sort int DEFAULT 0
);
INSERT INTO model_tiers (tier,label,emoji,model_id,fallback_model_id,sort) VALUES
  ('fast','Fast','⚡','google/gemini-3-flash-preview','default',1),
  ('smart','Smart','🧠','default',NULL,2),
  ('deep','Deep','🔬','anthropic/claude-fable-5','default',3)
ON CONFLICT (tier) DO NOTHING;
ALTER TABLE model_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS model_tiers_read ON model_tiers;
CREATE POLICY model_tiers_read ON model_tiers FOR SELECT TO authenticated USING (true);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_model_tiers text[] DEFAULT '{fast,smart}';
-- UPDATE organizations SET allowed_model_tiers='{fast,smart,deep}' WHERE slug='barnhaus';
