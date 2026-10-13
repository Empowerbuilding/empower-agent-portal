-- Lead monetization: org-level feature flag for the Monetization cockpit tab in portal CRM
-- Applied live 2026-10-12; barnhaus org enabled.
alter table organizations add column if not exists monetization_enabled boolean default false;
update organizations set monetization_enabled = true where slug = 'barnhaus';
