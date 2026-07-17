/**
 * lib/agent-router.ts — Agent action router
 * Maps agentId → server + container → action.
 * All agent operations go through here. Never SSH directly from API routes.
 */

import { sshExec, sshWriteFile, sshReadFile, sshListFiles, buildSSHConfig } from './ssh';
import { createClient } from './supabase/server';

export interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
  container_name: string;
  workspace_path: string;
  server_host: string;
  ssh_key_secret: string;
  org_id: string;
  github_repo?: string;
  github_token?: string;
}

export interface ContextStat {
  tokens: number;
  ctx: number;
  pct: number;
}

/**
 * Look up agent routing info from the DB.
 */
export async function getAgent(agentId: string): Promise<AgentInfo | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('agents')
    .select('id, name, display_name, container_name, workspace_path, server_host, ssh_key_secret, org_id, github_repo, github_token')
    .eq('id', agentId)
    .single();
  return data as AgentInfo | null;
}

/**
 * Look up agent by channel ID (portal_channels → agents).
 */
export async function getAgentByChannel(channelId: string): Promise<AgentInfo | null> {
  const supabase = await createClient();
  const { data: channel } = await supabase
    .from('portal_channels')
    .select('agent_id')
    .eq('id', channelId)
    .single();
  if (!channel?.agent_id) return null;
  return getAgent(channel.agent_id);
}

/**
 * Execute a shell command on the agent's server.
 */
export async function agentExec(agentId: string, command: string): Promise<string> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  return sshExec(config, command);
}

/**
 * Run a command inside the agent's Docker container.
 */
export async function agentDockerExec(agentId: string, command: string): Promise<string> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  return sshExec(config, `docker exec ${agent.container_name} ${command} 2>&1 || true`);
}

/**
 * Write a file to the agent's workspace.
 */
export async function agentWriteFile(agentId: string, fileName: string, content: string): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (!agent.server_host && agent.github_repo) {
    const token = agent.github_token;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Get current SHA for update
    const getRes = await fetch(`https://api.github.com/repos/${agent.github_repo}/contents/${fileName}`, { headers });
    const sha = getRes.ok ? (await getRes.json()).sha : undefined;
    const body: any = { message: `portal: update ${fileName}`, content: Buffer.from(content).toString('base64') };
    if (sha) body.sha = sha;
    const putRes = await fetch(`https://api.github.com/repos/${agent.github_repo}/contents/${fileName}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putRes.ok) throw new Error(`GitHub write error: ${putRes.status}`);
    return;
  }
  if (!agent.server_host) throw new Error('Files are managed locally for this agent.');
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  const filePath = `${agent.workspace_path}/${fileName}`;
  await sshWriteFile(config, filePath, content);
}

/**
 * Read a file from the agent's workspace.
 */
export async function agentReadFile(agentId: string, fileName: string): Promise<string> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (!agent.server_host && agent.github_repo) {
    const token = agent.github_token;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${agent.github_repo}/contents/${fileName}`, { headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  if (!agent.server_host) throw new Error('Files are managed locally for this agent.');
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  return sshReadFile(config, `${agent.workspace_path}/${fileName}`);
}

/**
 * List .md files in the agent's workspace root.
 */
export async function agentListFiles(agentId: string): Promise<{ name: string; path: string; size: number }[]> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  // GitHub-backed agent — list files from repo
  if (!agent.server_host && agent.github_repo) {
    const token = agent.github_token;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${agent.github_repo}/contents/`, { headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const items: any[] = await res.json();
    return items
      .filter((f: any) => f.type === 'file' && f.name.endsWith('.md'))
      .map((f: any) => ({ name: f.name, path: f.path, size: f.size }));
  }
  if (!agent.server_host) return [];
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  return sshListFiles(config, `${agent.workspace_path}/*.md`);
}

/**
 * Get context usage stats for all portal channels on this agent.
 * Returns { channelId: { tokens, ctx, pct } }
 */
export async function agentGetContextStats(agentId: string): Promise<Record<string, ContextStat>> {
  const agent = await getAgent(agentId);
  if (!agent) return {};
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);

  const command = `docker exec ${agent.container_name} python3 -c "
import json
path = '/home/node/.openclaw/agents/main/sessions/sessions.json'
with open(path) as f:
    d = json.load(f)
out = {}
for k, v in d.items():
    if 'portal:channel:' in k:
        channel_id = k.split('portal:channel:')[-1]
        tokens = v.get('totalTokens', 0)
        ctx = v.get('contextTokens', 1)
        out[channel_id] = {'tokens': tokens, 'ctx': ctx, 'pct': round(tokens/ctx*100, 1)}
print(json.dumps(out))
" 2>/dev/null`;

  try {
    const output = await sshExec(config, command);
    return JSON.parse(output.trim());
  } catch {
    return {};
  }
}

/**
 * Reset context for a specific channel on this agent.
 */
export async function agentResetContext(agentId: string, channelId: string): Promise<boolean> {
  const agent = await getAgent(agentId);
  if (!agent) return false;

  // Local agent (Tony) — edit sessions.json directly on the gateway machine
  if (!agent.server_host) {
    try {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');
      const sessionFile = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
      const raw = await fs.readFile(sessionFile, 'utf8');
      const d = JSON.parse(raw);
      const prefix = `agent:main:portal:channel:${channelId}`;
      for (const k of Object.keys(d)) {
        if (k === prefix || k.startsWith(prefix + ':')) delete d[k];
      }
      await fs.writeFile(sessionFile, JSON.stringify(d, null, 2));
      return true;
    } catch { return false; }
  }

  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);

  // Session keys use the full format: agent:main:portal:channel:<channelId>
  // Also handle legacy dated variants: agent:main:portal:channel:<channelId>:<date>
  const command = `docker exec ${agent.container_name} python3 -c "
import json
path = '/home/node/.openclaw/agents/main/sessions/sessions.json'
with open(path) as f: d = json.load(f)
prefix = 'agent:main:portal:channel:${channelId}'
to_delete = [k for k in list(d.keys()) if k == prefix or k.startswith(prefix + ':')]
for k in to_delete: del d[k]
with open(path, 'w') as f: json.dump(d, f)
print('reset ok, deleted:', to_delete)
" 2>/dev/null`;

  try {
    await sshExec(config, command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restart the agent's Docker container.
 */
export async function agentRestart(agentId: string): Promise<boolean> {
  const agent = await getAgent(agentId);
  if (!agent) return false;
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  try {
    await sshExec(config, `docker restart ${agent.container_name}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the running status of an agent's container.
 */
export async function agentGetStatus(agentId: string): Promise<'running' | 'stopped' | 'unhealthy' | 'unknown'> {
  const agent = await getAgent(agentId);
  if (!agent) return 'unknown';
  const config = buildSSHConfig(agent.server_host, agent.ssh_key_secret);
  try {
    const output = await sshExec(config,
      `docker inspect --format '{{.State.Status}}:{{.State.Health.Status}}' ${agent.container_name} 2>/dev/null`
    );
    const [state, health] = output.trim().split(':');
    if (state !== 'running') return 'stopped';
    if (health === 'unhealthy') return 'unhealthy';
    return 'running';
  } catch {
    return 'unknown';
  }
}
