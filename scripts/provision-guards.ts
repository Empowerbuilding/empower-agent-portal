/**
 * provision-guards.ts — S30a pre-flight collision guards for the provisioning wizard.
 *
 * Context (see plans/portal-productization/S30_DISCOVERY.md, risk R1):
 * before S30a the ONLY collision check was the DB org-slug UNIQUE constraint.
 * Container name `<slug>-openclaw` and host dir `/root/.<slug>-agent` were never
 * checked, and the docker-run "already in use" error was swallowed. A new org
 * slugged `sales` would rm -rf the live Barnhaus Vanessa workspace; slugs like
 * `atlas`/`esry`/`frank` passed all checks and then seeded crons into foreign
 * live containers — and failure-rollback would docker-rm the live agent.
 *
 * These guards run BEFORE any provisioning side-effect (DB insert, SSH mutation,
 * Telnyx purchase, CRM project creation). Three layers:
 *   1. Slug format validation (also protects shell interpolation on the CLI path).
 *   2. Static reserved-slug blocklist (works even if SSH is down).
 *   3. Live host checks: docker ps -a name collision + workspace dir existence.
 */

// ── Layer 1: slug format ─────────────────────────────────────────────────────
// Strict: lowercase alnum + hyphens, must start/end alnum, 2-40 chars.
// This also protects every shell command that interpolates the slug
// (ocPath, containerName, sed, docker run) from injection via the CLI path,
// which — unlike the API route — previously had NO format validation at all.
export const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export function validateSlugFormat(slug: string): string | null {
  if (!slug || typeof slug !== 'string') return 'orgSlug is required';
  if (!SLUG_FORMAT.test(slug)) {
    return `orgSlug "${slug}" is invalid — lowercase letters, numbers, and hyphens only (2-40 chars, must start/end alphanumeric)`;
  }
  return null;
}

// ── Layer 2: static reserved-slug blocklist ──────────────────────────────────
// Every live agent, container stem, and infra name on the DO droplet
// (142.93.29.212) as of 2026-08-30 (`docker ps -a` + `ls /root/.*agent*`).
// A slug on this list would derive a container name or host dir that collides
// with (or is confusingly close to) live production infrastructure.
export const RESERVED_SLUGS: readonly string[] = [
  // Live agent containers: <name>-openclaw
  'atlas', 'blueprint', 'ceo', 'codie', 'emma', 'esry', 'finley',
  'frank', 'juanito', 'relay',
  'its-training', 'its',            // its-training-openclaw + /root/.its-training-agent
  'showcase',                        // showcase-openclaw + /root/.showcase-agent
  // Barnhaus Vanessa — THE landmine: slug `sales` → ocPath /root/.sales-agent
  // which is the LIVE mounted volume of sales-agent-openclaw-gateway-1
  'sales', 'sales-agent', 'vanessa',
  // Legacy host dirs: /root/.portal-agent, /root/.portal-agent-digital-amigos
  'portal', 'portal-agent', 'digital-amigos',
  // Agent display-name slugs in active use
  'tony',
  // Shared infra containers / confusables on the same droplet
  'n8n', 'coolify', 'umami', 'postgresql', 'postgres', 'redis',
  // Platform/brand confusables
  'barnhaus', 'empower', 'admin', 'api', 'www', 'test',
];

// Exact live container names (docker ps -a, 2026-08-30) that don't follow the
// `<slug>-openclaw` pattern but must never be touched. Used for defense-in-depth
// in rollback: we refuse to docker-rm / rm -rf anything matching these.
export const PROTECTED_CONTAINER_NAMES: readonly string[] = [
  'sales-agent-openclaw-gateway-1',
];

export const PROTECTED_HOST_DIRS: readonly string[] = [
  '/root/.sales-agent',
  '/root/.showcase-agent',
  '/root/.its-training-agent',
  '/root/.portal-agent',
  '/root/.portal-agent-digital-amigos',
  '/root/portal-templates',
];

export function checkReservedSlug(slug: string): string | null {
  const s = (slug ?? '').trim().toLowerCase();
  if (RESERVED_SLUGS.includes(s)) {
    return `orgSlug "${slug}" is reserved — it collides with a live agent, container, or host directory on the agent server. Pick a different slug.`;
  }
  // Derived-path defense: slug whose ocPath/container lands on a protected asset
  const ocPath = `/root/.${s}-agent`;
  if (PROTECTED_HOST_DIRS.includes(ocPath)) {
    return `orgSlug "${slug}" is reserved — workspace path ${ocPath} belongs to a live agent.`;
  }
  const containerName = `${s}-openclaw`;
  if (PROTECTED_CONTAINER_NAMES.includes(containerName)) {
    return `orgSlug "${slug}" is reserved — container name ${containerName} belongs to a live agent.`;
  }
  return null;
}

// ── Layer 3: live host checks ────────────────────────────────────────────────
// Minimal interface so the checks are unit-testable with a fake and work with
// node-ssh's NodeSSH instance directly.
export interface RemoteExec {
  execCommand(cmd: string): Promise<{ stdout: string; stderr: string; code: number | null }>;
}

/**
 * Read-only host collision checks. Returns a list of human-readable collision
 * errors (empty = clear to proceed). Throws if the checks themselves cannot be
 * executed — we must FAIL CLOSED: no answer means no provisioning.
 */
export async function checkHostCollisions(
  ssh: RemoteExec,
  slug: string,
): Promise<string[]> {
  const errors: string[] = [];
  const containerName = `${slug}-openclaw`;
  const ocPath = `/root/.${slug}-agent`;

  // 1. Container name collision — docker ps -a (read-only)
  const psRes = await ssh.execCommand(`docker ps -a --format '{{.Names}}'`);
  if (psRes.code !== 0) {
    throw new Error(
      `Pre-flight failed: could not list containers on agent server (exit ${psRes.code}): ${psRes.stderr || psRes.stdout}`,
    );
  }
  const names = psRes.stdout.split('\n').map(n => n.trim()).filter(Boolean);
  if (names.includes(containerName)) {
    errors.push(`Container "${containerName}" already exists on the agent server (docker ps -a). Refusing to provision on top of it.`);
  }
  // Also catch a slug that IS an existing container name outright (e.g. "coolify")
  if (names.includes(slug)) {
    errors.push(`A container named "${slug}" already exists on the agent server. Pick a different slug.`);
  }

  // 2. Host workspace dir collision — test -e (read-only)
  const dirRes = await ssh.execCommand(`test -e ${ocPath} && echo EXISTS || echo ABSENT`);
  if (dirRes.code !== 0 && !dirRes.stdout.includes('ABSENT') && !dirRes.stdout.includes('EXISTS')) {
    throw new Error(
      `Pre-flight failed: could not check host dir ${ocPath} (exit ${dirRes.code}): ${dirRes.stderr || dirRes.stdout}`,
    );
  }
  if (dirRes.stdout.includes('EXISTS')) {
    errors.push(`Host directory ${ocPath} already exists on the agent server. Refusing to overwrite it (possible half-provisioned remnant or live agent — inspect manually).`);
  }

  return errors;
}

/**
 * Full pre-flight: format + blocklist + live host checks.
 * Throws with a clear aggregated message on ANY collision.
 * Call this BEFORE any DB insert, SSH mutation, or external API purchase.
 */
export async function assertProvisionPreflight(ssh: RemoteExec, slug: string): Promise<void> {
  const fmtErr = validateSlugFormat(slug);
  if (fmtErr) throw new Error(`Pre-flight: ${fmtErr}`);

  const reservedErr = checkReservedSlug(slug);
  if (reservedErr) throw new Error(`Pre-flight: ${reservedErr}`);

  const hostErrors = await checkHostCollisions(ssh, slug);
  if (hostErrors.length > 0) {
    throw new Error(`Pre-flight collision check failed:\n- ${hostErrors.join('\n- ')}`);
  }
}

// ── Rollback defense-in-depth ────────────────────────────────────────────────
/**
 * Final gate before any destructive rollback action. Returns an error string if
 * the target is (or resembles) a protected live asset — rollback must then SKIP
 * that action and surface the skip, never delete.
 */
export function checkRollbackTargetSafe(kind: 'container' | 'dir', target: string): string | null {
  if (kind === 'container') {
    if (PROTECTED_CONTAINER_NAMES.includes(target)) {
      return `Rollback refused: container "${target}" is a protected live agent.`;
    }
    const stem = target.replace(/-openclaw$/, '');
    if (RESERVED_SLUGS.includes(stem)) {
      return `Rollback refused: container "${target}" derives from reserved slug "${stem}".`;
    }
  } else {
    if (PROTECTED_HOST_DIRS.includes(target)) {
      return `Rollback refused: directory "${target}" is a protected live agent workspace.`;
    }
    const m = target.match(/^\/root\/\.([a-z0-9-]+)-agent$/);
    if (!m) {
      return `Rollback refused: directory "${target}" does not match the provisioner's /root/.<slug>-agent pattern.`;
    }
    if (RESERVED_SLUGS.includes(m[1])) {
      return `Rollback refused: directory "${target}" derives from reserved slug "${m[1]}".`;
    }
  }
  return null;
}
