/**
 * lib/ssh.ts — Centralized SSH utility
 * All server-side SSH operations go through here.
 * Keep this file server-only (never import from client components).
 */

import { Client } from 'ssh2';

export interface SSHConfig {
  host: string;
  port?: number;
  username?: string;
  privateKey: string;
}

function makeConfig(host: string, privateKey: string): SSHConfig {
  return { host, port: 22, username: 'root', privateKey };
}

/**
 * Execute a shell command on a remote host.
 * Returns stdout. Throws on non-zero exit if no stdout.
 */
export function sshExec(config: SSHConfig, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); reject(err); return; }
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number) => {
          conn.end();
          if (code !== 0 && !stdout.trim()) {
            reject(new Error(stderr.trim() || `Command exited with code ${code}`));
          } else {
            resolve(stdout);
          }
        });
      });
    });
    conn.on('error', (err) => reject(err));
    conn.connect({ host: config.host, port: config.port ?? 22, username: config.username ?? 'root', privateKey: config.privateKey });
  });
}

/**
 * Write content to a file on a remote host.
 * Uses printf to safely handle special characters and newlines.
 */
export async function sshWriteFile(config: SSHConfig, path: string, content: string): Promise<void> {
  // Escape single quotes in content for shell safety
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  await sshExec(config, `printf '%s' '${escaped}' > ${path}`);
}

/**
 * Read a file from a remote host.
 */
export async function sshReadFile(config: SSHConfig, path: string): Promise<string> {
  return sshExec(config, `cat ${path}`);
}

/**
 * List files matching a glob pattern on a remote host.
 * Returns array of { name, path, size } objects.
 */
export async function sshListFiles(
  config: SSHConfig,
  pattern: string
): Promise<{ name: string; path: string; size: number }[]> {
  let output = '';
  try {
    output = await sshExec(config, `ls -la ${pattern} 2>/dev/null | awk '{print $5, $9}'`);
  } catch {
    return [];
  }

  const files: { name: string; path: string; size: number }[] = [];
  for (const line of output.trim().split('\n')) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const size = parseInt(parts[0]) || 0;
    const fullPath = parts[1];
    const name = fullPath.split('/').pop() ?? fullPath;
    files.push({ name, path: fullPath, size });
  }
  return files;
}

/**
 * Get the SSH private key from environment variables.
 * Reads from the env var named by `secretName` (base64-encoded).
 * Falls back to reading a key file for local dev.
 */
export function getSSHKey(secretName = 'RESET_SSH_KEY'): string {
  const b64 = process.env[secretName];
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');

  // Dev fallback — read key file if it exists
  try {
    const fs = require('fs');
    const keyFile = '/app/portal-reset.key';
    if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, 'utf8');
  } catch {}
  return '';
}

/**
 * Build an SSHConfig for a given host using the standard key.
 */
export function buildSSHConfig(host: string, secretName = 'RESET_SSH_KEY'): SSHConfig {
  return makeConfig(host, getSSHKey(secretName));
}
