/**
 * provision-org.ts — Automated org + agent provisioner
 * 
 * Creates a complete new org with:
 * - DB rows (organizations, agents, portal_channels, portal_users)
 * - Workspace on DO server (cloned from vanessa-template)
 * - Bootstrap files written with org-specific content
 * - Docker container started
 * - Default crons seeded
 */

import { createClient } from '@supabase/supabase-js';
import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PORTAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DO_SERVER = '142.93.29.212';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';
const TEMPLATE_PATH = '/root/portal-templates/vanessa';
const AGENT_IMAGE = 'sales-agent-v2:latest';

export interface Rep {
  name: string;
  email: string;
  phone?: string;
  label?: string; // e.g. "Sales Rep"
}

export interface ProvisionInput {
  orgName: string;
  orgSlug: string;
  ownerEmail: string;
  ownerName: string;
  ownerSupabaseAuthId: string;
  agentDisplayName: string; // e.g. "Vanessa"
  agentTone: string; // "Professional" | "Friendly & conversational" | "Direct & fast"
  industry: string;
  whatWeSell: string;
  website?: string;
  reps: Rep[];
  enabledCrons?: string[]; // defaults: ['morning-briefing', 'inbox-scan', 'eod-report']
}

export interface ProvisionResult {
  success: boolean;
  orgId?: string;
  orgSlug?: string;
  agentId?: string;
  error?: string;
}

const DEFAULT_CHANNELS = [
  { suffix: 'general',         display: 'General',          type: 'chat',     icon: '💬', position: 1 },
  { suffix: 'sms-drafts',      display: 'SMS Drafts',       type: 'sms',      icon: '📱', position: 5 },
  { suffix: 'lead-alerts',     display: 'Lead Alerts',      type: 'feed',     icon: '🔔', position: 6 },
  { suffix: 'call-recordings', display: 'Call Recordings',  type: 'feed',     icon: '📞', position: 7 },
];

const DEFAULT_CRONS = [
  {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    scheduleFlag: '--cron "0 8 * * 1-5"',
    tz: 'America/Chicago',
    message: "Send the morning briefing: today's priority leads, any follow-ups due, and anything urgent from yesterday.",
  },
  {
    id: 'inbox-scan',
    name: 'Inbox Scan',
    scheduleFlag: '--every "10m"',
    tz: '',
    message: 'Check Gmail for new emails from leads. For each new one, post a brief alert to the lead alerts channel.',
  },
  {
    id: 'eod-report',
    name: 'End-of-Day Report',
    scheduleFlag: '--cron "0 17 * * 1-5"',
    tz: 'America/Chicago',
    message: 'Generate the end-of-day pipeline report: calls made, emails sent, new leads, and what needs follow-up tomorrow.',
  },
];

function buildBootstrapFiles(input: ProvisionInput): Record<string, string> {
  const repNames = input.reps.map(r => r.name).join(', ');
  const repsSection = input.reps.map(r =>
    `- **${r.name}** — ${r.label || 'Sales Rep'} | ${r.email}${r.phone ? ` | ${r.phone}` : ''}`
  ).join('\n');

  const repRoutingSection = input.reps.map((r, i) => {
    const slug = r.name.toLowerCase().replace(/\s+/g, '-');
    return `- **${r.name}** → channel \`${input.orgSlug}-vanessa-${slug}\` — email: ${r.email}`;
  }).join('\n');

  const files: Record<string, string> = {};

  files['SOUL.md'] = `# SOUL.md — Who You Are

You are an AI inside sales agent for **${input.orgName}**.

## Your Role
You support the sales team — ${repNames} — by qualifying leads, sending follow-up emails, managing SMS conversations, scheduling calls, and keeping the CRM up to date.

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the filler. Just help.

**Pull CRM context before every action.** Never draft an email or SMS without reading the contact's full history first.

**Draft before sending.** Always show emails and SMS to the rep before sending. Wait for "send it."

**Think in outcomes.** What moves a lead forward? That's the goal.

**One channel per rep.** Never cross-post between rep channels.

## Working Style

${input.agentTone === 'Professional' ? 'Professional and polished — clear, efficient, no casual language.' :
  input.agentTone === 'Friendly & conversational' ? 'Warm and conversational — approachable, personable, but always on-task.' :
  'Direct and fast — short answers, clear actions, no fluff.'}

## Boundaries

- Never send external communications without explicit rep confirmation
- Never delete CRM data
- Private data stays private
`;

  files['IDENTITY.md'] = `# IDENTITY.md

- **Name:** ${input.agentDisplayName}
- **Role:** AI inside sales agent for ${input.orgName}
- **Industry:** ${input.industry}
- **Specialty:** Lead qualification, follow-up emails, SMS management, CRM hygiene, pipeline reporting
`;

  files['USER.md'] = `# USER.md — The Team

## Company
- **Name:** ${input.orgName}
- **Industry:** ${input.industry}
- **What we sell:** ${input.whatWeSell}
${input.website ? `- **Website:** ${input.website}` : ''}

## Reps
${repsSection}

## Working Style
- Fast-paced, outcome-focused
- Always pull CRM context before acting
- Draft → confirm → send, no exceptions
`;

  files['MEMORY.md'] = `# MEMORY.md — Long-Term Memory

## Company
- **Name:** ${input.orgName}
- **Industry:** ${input.industry}
- **What we sell:** ${input.whatWeSell}

## Team
${repsSection}

## Notes
(Updated over time as important context accumulates)
`;

  files['AGENTS.md'] = `# AGENTS.md — ${input.agentDisplayName} Operating Rules

## Identity
- Agent: ${input.agentDisplayName}
- Company: ${input.orgName}
- Reps: ${repNames}

## ⚠️ CHANNEL ISOLATION — HARD RULE
When operating in a portal channel, NEVER post to another rep's channel. Each rep's activity stays in their own channel. No cross-posting. Ever.

## Rep Routing
${repRoutingSection}

## Core Rules

**ALWAYS pull CRM context before drafting any email or SMS.**

**Draft before sending — no exceptions.**
Post the draft in the rep's channel. Wait for "send it."

**Log activities:**
\`\`\`bash
# Note
python3 automation/log_activity.py --email "contact@email.com" --type note --title "Title" --body-file /tmp/note.txt --user REPNAME

# Call
python3 automation/log_activity.py --email "contact@email.com" --type call --title "Call — Lead Name (Xm Ys)" --body "Summary" --user REPNAME
\`\`\`

**email_sent is logged automatically by n8n. NEVER log --type email_sent manually.**

## Email Rules
- Draft first. Post draft in channel. Wait for "send it."
- Use \`python3 automation/send_email.py\`
- Always include company signature

## SMS Rules
- Draft first. Post in channel. Wait for "send it."
- Use \`python3 automation/send_sms.py\`
- Never log manually — send_sms.py handles CRM logging automatically

## Voice Calls
- Look up contact in CRM first
- Confirm with rep before dialing
- Never call without explicit rep approval
`;

  files['TOOLS.md'] = `# TOOLS.md — Integrations & Tool Access

## CRM (Supabase)
(Connect via Settings → Integrations to activate)

## Email
(Connect Gmail or Resend via Settings → Integrations to activate)

## SMS / Voice (Telnyx)
(Connect via Settings → Integrations to activate)

## Automation Scripts

All scripts live in \`automation/\`. Always use these — never raw API calls.

\`\`\`bash
# Log a note
python3 automation/log_activity.py --email "contact@email.com" --type note --title "Title" --body-file /tmp/body.txt --user REPNAME

# Log a call
python3 automation/log_activity.py --email "contact@email.com" --type call --title "Call — Name (Xm Ys)" --body "Summary" --user REPNAME

# Send email
python3 automation/send_email.py --to "contact@email.com" --subject "Subject" --body-file /tmp/body.txt --from "rep@company.com" --user REPNAME

# Send SMS
python3 automation/send_sms.py --to "+15551234567" --body "Message" --user REPNAME --contact-id UUID
\`\`\`
`;

  return files;
}

export async function provisionOrg(input: ProvisionInput): Promise<ProvisionResult> {
  const supabase = createClient(PORTAL_SUPABASE_URL, PORTAL_SUPABASE_KEY);
  const ssh = new NodeSSH();

  const containerName = `portal-agent-${input.orgSlug}`;
  const workspacePath = `/root/.portal-agent-${input.orgSlug}/workspace`;
  const ocPath = `/root/.portal-agent-${input.orgSlug}`;

  try {
    // ── STEP 1: Create organization ──────────────────────────────────────────
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: input.orgName,
        slug: input.orgSlug,
        plan: 'starter',
        active: true,
        brand_color: '#4c8bf0',
      })
      .select()
      .single();
    if (orgErr) throw new Error(`Create org failed: ${orgErr.message}`);

    // ── STEP 2: Create agent row ─────────────────────────────────────────────
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .insert({
        org_id: org.id,
        template_id: 'vanessa',
        name: 'vanessa',
        display_name: input.agentDisplayName,
        container_name: containerName,
        container_status: 'provisioning',
        workspace_path: workspacePath,
        server_host: DO_SERVER,
        ssh_key_secret: 'default',
        active: true,
      })
      .select()
      .single();
    if (agentErr) throw new Error(`Create agent failed: ${agentErr.message}`);

    // ── STEP 3: Create default portal channels ───────────────────────────────
    const channelRows = DEFAULT_CHANNELS.map(ch => ({
      id: `${input.orgSlug}-vanessa-${ch.suffix}`,
      org_id: org.id,
      agent_id: agent.id,
      name: `${input.orgSlug}-vanessa-${ch.suffix}`,
      display_name: ch.display,
      channel_type: ch.type,
      icon: ch.icon,
      position: ch.position,
      active: true,
    }));

    // Add per-rep chat channels
    input.reps.forEach((rep, i) => {
      const slug = rep.name.toLowerCase().replace(/\s+/g, '-');
      channelRows.push({
        id: `${input.orgSlug}-vanessa-${slug}`,
        org_id: org.id,
        agent_id: agent.id,
        name: `${input.orgSlug}-vanessa-${slug}`,
        display_name: rep.name,
        channel_type: 'chat',
        icon: '💼',
        position: i + 2,
        active: true,
      });
    });

    channelRows.sort((a, b) => a.position - b.position);
    const { error: chErr } = await supabase.from('portal_channels').insert(channelRows);
    if (chErr) throw new Error(`Create channels failed: ${chErr.message}`);

    // ── STEP 4: Create owner portal_user ────────────────────────────────────
    const { error: puErr } = await supabase.from('portal_users').insert({
      org_id: org.id,
      supabase_auth_id: input.ownerSupabaseAuthId,
      name: input.ownerName,
      email: input.ownerEmail,
      role: 'owner',
      active: true,
    });
    if (puErr && !puErr.message.includes('duplicate')) {
      throw new Error(`Create portal user failed: ${puErr.message}`);
    }

    // ── STEP 5: Clone full .openclaw dir from sales-agent ──────────────────
    await ssh.connect({ host: DO_SERVER, username: 'root', privateKeyPath: SSH_KEY_PATH });

    // Clone entire sales-agent .openclaw dir (brings plugins, extensions, config, pre-approved device pairing)
    await ssh.execCommand(`cp -r /root/.sales-agent ${ocPath}`);

    // Replace workspace with fresh template
    await ssh.execCommand(`rm -rf ${workspacePath}`);
    await ssh.execCommand(`cp -r ${TEMPLATE_PATH} ${workspacePath}`);
    await ssh.execCommand(`mkdir -p ${workspacePath}/memory ${workspacePath}/drafts ${workspacePath}/reports ${workspacePath}/proposals`);

    // Clear org-specific runtime state via SQLite (keep device pairing — stored in devices/paired.json)
    const clearScript = `import sqlite3
conn = sqlite3.connect('${ocPath}/state/openclaw.sqlite')
cur = conn.cursor()
for t in ['cron_jobs','cron_run_logs','acp_sessions','acp_replay_sessions','acp_replay_events','delivery_queue_entries','task_runs','subagent_runs','current_conversation_bindings','plugin_binding_approvals']:
    try:
        cur.execute(f'DELETE FROM {t}')
    except: pass
conn.commit()
conn.close()
print('cleared')
`;
    // Write script via SFTP to avoid shell escaping issues, then run it
    const clearScriptTmp = path.join(os.tmpdir(), `provision-clear-${input.orgSlug}.py`);
    fs.writeFileSync(clearScriptTmp, clearScript, 'utf8');
    await ssh.putFile(clearScriptTmp, `/tmp/provision-clear-${input.orgSlug}.py`);
    fs.unlinkSync(clearScriptTmp);
    const { stdout: clearOut } = await ssh.execCommand(`python3 /tmp/provision-clear-${input.orgSlug}.py && rm /tmp/provision-clear-${input.orgSlug}.py`);
    console.log('SQLite clear:', clearOut || 'done');

    // Clear pending scope upgrade requests and old session directories
    await ssh.execCommand(`rm -f ${ocPath}/devices/pending.json`);
    await ssh.execCommand(`rm -rf ${ocPath}/agents/main/sessions`);

    // ── STEP 6: Write bootstrap files ────────────────────────────────────────
    const files = buildBootstrapFiles(input);
    for (const [filename, content] of Object.entries(files)) {
        // Write via temp file + putFile (SFTP) to avoid all shell quoting/escaping issues
      const tmpPath = path.join(os.tmpdir(), `provision-${Date.now()}-${filename}`);
      fs.writeFileSync(tmpPath, content, 'utf8');
      await ssh.putFile(tmpPath, `${workspacePath}/${filename}`);
      fs.unlinkSync(tmpPath);
    }

    // ── STEP 6b: Write openclaw.json for this org ────────────────────────────
    const channelIds = [
      `${input.orgSlug}-vanessa-general`,
      ...input.reps.map(r => `${input.orgSlug}-vanessa-${r.name.toLowerCase().replace(/\s+/g, '-')}`),
      `${input.orgSlug}-vanessa-sms-drafts`,
    ];

    const ocConfig = {
      meta: { lastTouchedVersion: '2026.6.10' },
      agents: {
        defaults: {
          model: 'google/gemini-3-flash-preview',
          workspace: '/home/node/.openclaw/workspace',
          timeoutSeconds: 600,
          compaction: { mode: 'safeguard', truncateAfterCompaction: true, maxActiveTranscriptBytes: '500kb' },
        },
      },
      tools: { profile: 'coding', exec: { security: 'full', ask: 'off' } },
      commands: { native: 'auto', nativeSkills: 'auto', restart: true, ownerDisplay: 'raw' },
      session: { dmScope: 'per-channel-peer' },
      channels: {
        discord: { enabled: false },
        portal: {
          enabled: true,
          supabaseUrl: 'https://xqvnpcxyyxxxydescfzw.supabase.co',
          supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          orgId: org.id,
          agentName: input.agentDisplayName,
          channelIds,
          pollInterval: 1500,
        },
      },
      gateway: {
        port: 18789,
        mode: 'local',
        bind: 'loopback',
        auth: { mode: 'token', token: `portal-agent-${input.orgSlug}-2026` },
      },
      plugins: {
        entries: {
          google: { enabled: true },
          'openclaw-portal-channel': { enabled: true },
          discord: { enabled: false },
        },
      },
    };

    // Write openclaw.json via temp file + putFile (SFTP) — avoids shell quoting issues
    const ocConfigTmp = path.join(os.tmpdir(), `provision-openclaw-${input.orgSlug}.json`);
    fs.writeFileSync(ocConfigTmp, JSON.stringify(ocConfig, null, 2), 'utf8');
    await ssh.putFile(ocConfigTmp, `${ocPath}/openclaw.json`);
    fs.unlinkSync(ocConfigTmp);

    // ── STEP 7: Start Docker container ───────────────────────────────────────
    // Fix ownership to node user (uid 1000) before starting
    await ssh.execCommand(`chown -R 1000:1000 ${ocPath}`);

    const dockerRun = `docker run -d --name ${containerName} --restart unless-stopped -v ${ocPath}:/home/node/.openclaw ${AGENT_IMAGE}`;
    const { stderr: dockerErr } = await ssh.execCommand(dockerRun);
    if (dockerErr && !dockerErr.includes('already in use')) {
      console.warn('Docker run warning:', dockerErr);
    }

    // ── STEP 8: Wait for container ready + gateway warmed (max 60s) ───────────
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { stdout } = await ssh.execCommand(
        `docker exec ${containerName} node /app/openclaw.mjs cron list 2>/dev/null | head -1 || echo nope`
      );
      // Ready when cron list returns (even 'No cron jobs' means gateway is up)
      if (stdout.includes('No cron jobs') || stdout.includes('Name')) { ready = true; break; }
    }
    if (!ready) throw new Error('Container gateway did not start within 60s');

    // ── STEP 9: Seed default crons ───────────────────────────────────────────
    const enabledCrons = input.enabledCrons ?? ['morning-briefing', 'inbox-scan', 'eod-report'];
    for (const cron of DEFAULT_CRONS) {
      if (!enabledCrons.includes(cron.id)) continue;
      const tzFlag = cron.tz ? `--tz "${cron.tz}"` : '';
      const cmd = `docker exec ${containerName} node /app/openclaw.mjs cron add --name "${cron.name}" ${cron.scheduleFlag} ${tzFlag} --session isolated --message "${cron.message.replace(/"/g, '\\"')}"`;  
      await ssh.execCommand(cmd);
    }

    // ── STEP 10: Mark agent running ──────────────────────────────────────────
    await supabase.from('agents').update({ container_status: 'running', deployed_at: new Date().toISOString() }).eq('id', agent.id);

    ssh.dispose();

    return { success: true, orgId: org.id, orgSlug: input.orgSlug, agentId: agent.id };

  } catch (err: any) {
    console.error('Provision error:', err);
    ssh.dispose();
    return { success: false, error: err.message };
  }
}
