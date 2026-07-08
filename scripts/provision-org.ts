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
import { provisionTelnyxNumber } from './provision-telnyx-number';
import { provisionSupabaseCrm } from './provision-supabase-crm';
import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateAllFiles, type WizardAnswers } from '../lib/bootstrap-writer';

const PORTAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DO_SERVER = '142.93.29.212';
// SSH key: prefer RESET_SSH_KEY (base64-encoded, set in Coolify) over a key file
function getSSHPrivateKey(): string {
  const b64 = process.env.RESET_SSH_KEY;
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  // Local dev fallback — read key file if it exists
  const keyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';
  try { return fs.readFileSync(keyPath, 'utf8'); } catch { return ''; }
}
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
  companyKnowledge?: string;
  businessHours?: string;
  enabledCrons?: string[]; // defaults: ['morning-briefing', 'inbox-scan', 'eod-report']
  wizard?: Omit<WizardAnswers, 'orgName' | 'orgSlug'>; // Full wizard answers if provided
}

export interface ProvisionResult {
  success: boolean;
  orgId?: string;
  orgSlug?: string;
  agentId?: string;
  error?: string;
}

const DEFAULT_CHANNELS = [
  { suffix: 'lead-alerts',     display: 'Lead Alerts',      type: 'feed',     icon: '🔔', position: 7 },
  { suffix: 'call-recordings', display: 'Call Recordings',  type: 'feed',     icon: '📞', position: 8 },
];

// NOTE: crons use --no-deliver so the agent posts results itself via the message tool.
// Each message explicitly names the target portal channel so isolated sessions know where to post.
function buildDefaultCrons(orgSlug: string, agentSlug: string = 'vanessa') {
  return [
    {
      id: 'morning-briefing',
      name: 'Morning Briefing',
      scheduleFlag: '--cron "0 8 * * 1-5"',
      tz: 'America/Chicago',
      message: `Send the morning briefing to the rep channels: today's priority leads, any follow-ups due, and anything urgent from yesterday.`,
    },
    {
      id: 'inbox-scan',
      name: 'Inbox Scan',
      scheduleFlag: '--every "30m"',
      tz: '',
      message: `Check Gmail for new emails from leads. For each new one, post a brief alert to the lead-alerts channel.`,
    },
    {
      id: 'eod-report',
      name: 'End-of-Day Report',
      scheduleFlag: '--cron "0 17 * * 1-5"',
      tz: 'America/Chicago',
      message: `Generate the end-of-day pipeline report: calls made, emails sent, new leads, and what needs follow-up tomorrow. Post the report to the rep channels.`,
    },
  ];
}


function buildBootstrapFiles(input: ProvisionInput): Record<string, string> {
  const tone = (input.wizard?.agentTone ?? (
    input.agentTone === 'Friendly & conversational' ? 'friendly' :
    input.agentTone === 'Direct & fast' ? 'direct' : 'professional'
  )) as 'professional' | 'friendly' | 'direct';

  const answers: WizardAnswers = {
    orgName: input.orgName,
    orgSlug: input.orgSlug,
    industry: input.wizard?.industry ?? input.industry,
    whatWeSell: input.wizard?.whatWeSell ?? input.whatWeSell,
    website: input.wizard?.website ?? input.website,
    agentName: input.wizard?.agentName ?? input.agentDisplayName,
    agentRole: input.wizard?.agentRole ?? 'inside sales agent',
    agentFocus: input.wizard?.agentFocus ?? ['qualify', 'calls', 'emails', 'sms'],
    agentTone: tone,
    companyKnowledge: (input.wizard as any)?.companyKnowledge ?? input.companyKnowledge ?? '',
    businessHours: (input.wizard as any)?.businessHours ?? input.businessHours ?? '',
    reps: input.reps,
  };
  return generateAllFiles(answers);
}


export async function provisionOrg(input: ProvisionInput): Promise<ProvisionResult> {
  const supabase = createClient(PORTAL_SUPABASE_URL, PORTAL_SUPABASE_KEY);
  const ssh = new NodeSSH();

  const containerName = `portal-agent-${input.orgSlug}`;
  const agentSlug = input.agentDisplayName.toLowerCase().replace(/\s+/g, '-');
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

    // Write reps to agents.reps column so n8n can look them up for call routing
    const repsForDb = input.reps.map(r => ({
      name: r.name,
      slug: r.name.toLowerCase().replace(/\s+/g, '-'),
      email: r.email || '',
      phone: r.phone || '',
      label: r.label || 'Sales Rep',
    }));
    await supabase.from('agents').update({ reps: repsForDb }).eq('id', agent.id);

    // ── STEP 2b: Provision Telnyx phone number ───────────────────────────────
    let telnyxPhone: string | null = null;
    try {
      if (process.env.TELNYX_API_KEY) {
        const telnyx = await provisionTelnyxNumber();
        telnyxPhone = telnyx.phoneNumber;
        await supabase.from('agents').update({ 
          telnyx_phone_number: telnyxPhone,
          telnyx_connection_id: '2996679323039040927'  // Empower Shared Voice
        }).eq('id', agent.id);
        console.log('[provision] Telnyx number assigned:', telnyxPhone);
      } else {
        console.warn('[provision] TELNYX_API_KEY not set — skipping phone provisioning');
      }
    } catch (e) {
      console.error('[provision] Telnyx provisioning failed (non-fatal):', e);
    }

    // ── STEP 2c: Provision Supabase CRM project ────────────────────────────────
    let crmSupabaseUrl = '';
    let crmServiceRoleKey = '';
    let crmDbPassword = '';
    try {
      if (process.env.SUPABASE_MANAGEMENT_API_KEY) {
        console.log('[provision] Provisioning CRM Supabase project...');
        const crm = await provisionSupabaseCrm(input.orgSlug);
        crmSupabaseUrl    = crm.supabaseUrl;
        crmServiceRoleKey = crm.serviceRoleKey;
        crmDbPassword     = crm.dbPassword;
        await supabase.from('agents').update({
          crm_supabase_url: crmSupabaseUrl,
          crm_supabase_key: crmServiceRoleKey,
        }).eq('id', agent.id);
        console.log('[provision] CRM project ready:', crmSupabaseUrl);
      } else {
        console.warn('[provision] SUPABASE_MANAGEMENT_API_KEY not set — skipping CRM provisioning');
      }
    } catch (e) {
      console.error('[provision] CRM provisioning failed (non-fatal):', e);
    }

        // ── STEP 3: Create default portal channels ───────────────────────────────
    const channelRows = DEFAULT_CHANNELS.map(ch => ({
      id: `${input.orgSlug}-${agentSlug}-${ch.suffix}`,
      org_id: org.id,
      agent_id: agent.id,
      name: `${input.orgSlug}-${agentSlug}-${ch.suffix}`,
      display_name: ch.display,
      channel_type: ch.type,
      icon: ch.icon,
      position: ch.position,
      active: true,
    }));

    // Add per-rep chat + SMS channels (Barnhaus model: one chat + one SMS per rep)
    input.reps.forEach((rep, i) => {
      const slug = rep.name.toLowerCase().replace(/\s+/g, '-');
      // Chat channel (where rep interacts with agent, requests drafts, etc.)
      channelRows.push({
        id: `${input.orgSlug}-${agentSlug}-${slug}`,
        org_id: org.id,
        agent_id: agent.id,
        name: `${input.orgSlug}-${agentSlug}-${slug}`,
        display_name: rep.name,
        channel_type: 'chat',
        icon: '💼',
        position: i + 2,
        active: true,
      });
      // SMS channel (displays inbound/outbound SMS threads for this rep)
      channelRows.push({
        id: `${input.orgSlug}-${agentSlug}-${slug}-sms`,
        org_id: org.id,
        agent_id: agent.id,
        name: `${input.orgSlug}-${agentSlug}-${slug}-sms`,
        display_name: `${rep.name} SMS`,
        channel_type: 'sms',
        icon: '📱',
        position: i + 3,
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

    // Fetch the new portal user's id to use for channel membership
    const { data: newPortalUser } = await supabase
      .from('portal_users')
      .select('id')
      .eq('org_id', org.id)
      .eq('supabase_auth_id', input.ownerSupabaseAuthId)
      .maybeSingle();

    // Add owner to all channels
    if (newPortalUser?.id) {
      const memberRows = channelRows.map(ch => ({
        channel_id: ch.id,
        user_id: newPortalUser.id,
      }));
      await supabase.from('portal_channel_members').insert(memberRows);
    }

    // ── STEP 5: Clone full .openclaw dir from sales-agent ──────────────────
    const sshPrivateKey = getSSHPrivateKey();
    if (!sshPrivateKey) throw new Error('No SSH key available — set RESET_SSH_KEY env var');
    await ssh.connect({ host: DO_SERVER, username: 'root', privateKey: sshPrivateKey });

    // Clone entire sales-agent .openclaw dir (brings plugins, extensions, config, pre-approved device pairing)
    await ssh.execCommand(`cp -r /root/.sales-agent ${ocPath}`);

    // Replace workspace with fresh template
    await ssh.execCommand(`rm -rf ${workspacePath}`);
    await ssh.execCommand(`cp -r ${TEMPLATE_PATH} ${workspacePath}`);
    await ssh.execCommand(`mkdir -p ${workspacePath}/memory ${workspacePath}/drafts ${workspacePath}/reports ${workspacePath}/proposals`);
    // Patch hardcoded Barnhaus channel IDs in automation scripts to use this org's channels
    await ssh.execCommand(`find ${workspacePath}/automation -name '*.py' | xargs sed -i 's/barnhaus-vanessa/${input.orgSlug}-${agentSlug}/g' 2>/dev/null || true`);

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
      ...input.reps.flatMap(r => {
        const slug = r.name.toLowerCase().replace(/\s+/g, '-');
        return [
          `${input.orgSlug}-${agentSlug}-${slug}`,
          `${input.orgSlug}-${agentSlug}-${slug}-sms`,
        ];
      }),
      `${input.orgSlug}-${agentSlug}-lead-alerts`,
      `${input.orgSlug}-${agentSlug}-call-recordings`,
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
      tools: { profile: 'full', exec: { security: 'full', ask: 'off' } },
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
          pollInterval: 500,
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

    // ── STEP 6c: Write org_config.json for automation scripts ─────────────────
    // All automation scripts (portal_utils, send_sms, log_activity, etc.) read this
    // file instead of hardcoding Barnhaus credentials. Written before container starts.
    const orgConfig = {
      org_slug:           input.orgSlug,
      org_id:             org.id,
      org_name:           input.orgName,
      org_website:        input.website || input.wizard?.website || '',
      org_phone:          input.wizard?.phone || '',
      agent_name:         input.agentDisplayName,
      portal_supabase_url: PORTAL_SUPABASE_URL,
      portal_supabase_key: PORTAL_SUPABASE_KEY,
      crm_supabase_url:   crmSupabaseUrl,
      crm_supabase_key:   crmServiceRoleKey,
      // Telnyx: populated from provisioned number; key from shared env
      telnyx_api_key:     process.env.TELNYX_API_KEY || '',
      telnyx_from_number: telnyxPhone || '',
      reps: input.reps.map(r => ({
        name:            r.name,
        slug:            r.name.toLowerCase().replace(/\s+/g, '-'),
        email:           r.email,
        phone:           r.phone || '',
        crm_id:          '',   // populated after CRM is connected
        portal_channel:  `${input.orgSlug}-${agentSlug}-${r.name.toLowerCase().replace(/\s+/g, '-')}`,
        token_file:      `${r.name.toLowerCase().replace(/\s+/g, '_')}_token.json`,
      })),
    };
    const orgConfigTmp = path.join(os.tmpdir(), `provision-org-config-${input.orgSlug}.json`);
    fs.writeFileSync(orgConfigTmp, JSON.stringify(orgConfig, null, 2), 'utf8');
    await ssh.putFile(orgConfigTmp, `${workspacePath}/automation/org_config.json`);
    fs.unlinkSync(orgConfigTmp);
    console.log('[provision] org_config.json written for', input.orgSlug);

    // ── STEP 7: Start Docker container ───────────────────────────────────────
    // Fix ownership to node user (uid 1000) before starting
    await ssh.execCommand(`chown -R 1000:1000 ${ocPath}`);

    const gatewayToken = `portal-agent-${input.orgSlug}-2026`;
    const dockerRun = `docker run -d --name ${containerName} --restart unless-stopped -e OPENCLAW_GATEWAY_TOKEN=${gatewayToken} -v ${ocPath}:/home/node/.openclaw ${AGENT_IMAGE}`;
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
    const defaultCrons = buildDefaultCrons(input.orgSlug, agentSlug);
    for (const cron of defaultCrons) {
      if (!enabledCrons.includes(cron.id)) continue;
      const tzFlag = cron.tz ? `--tz "${cron.tz}"` : '';
      // Use --no-deliver: portal channel doesn't support announce delivery.
      // The agent posts results itself via the message tool using the channel name in the message.
      const cmd = `docker exec ${containerName} node /app/openclaw.mjs cron add --name "${cron.name}" ${cron.scheduleFlag} ${tzFlag} --session isolated --no-deliver --message "${cron.message.replace(/"/g, '\\"')}"`;  
      await ssh.execCommand(cmd);
    }

    // ── STEP 10: Seed Google OAuth credentials into agent_env_vars ──────────
    // These come from the shared Empower Google OAuth client (baked into template)
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const now = new Date().toISOString();
    if (googleClientId && googleClientSecret) {
      await supabase.from('agent_env_vars').upsert([
        { agent_id: agent.id, key: 'GOOGLE_CLIENT_ID', value: googleClientId, value_encrypted: '', display_name: 'Google Client ID', integration_id: 'google', is_secret: false, updated_at: now },
        { agent_id: agent.id, key: 'GOOGLE_CLIENT_SECRET', value: googleClientSecret, value_encrypted: '', display_name: 'Google Client Secret', integration_id: 'google', is_secret: true, updated_at: now },
      ], { onConflict: 'agent_id,key' });
    } else {
      console.warn('[provision] GOOGLE_CLIENT_ID/SECRET not set — skipping Google OAuth seeding');
    }

    // ── STEP 11: Mark agent running ───────────────────────────────────────────
    await supabase.from('agents').update({ container_status: 'running', deployed_at: new Date().toISOString() }).eq('id', agent.id);

    ssh.dispose();

    return { success: true, orgId: org.id, orgSlug: input.orgSlug, agentId: agent.id };

  } catch (err: any) {
    console.error('Provision error:', err);
    ssh.dispose();
    return { success: false, error: err.message };
  }
}
