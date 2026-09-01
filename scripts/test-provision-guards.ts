/**
 * test-provision-guards.ts — unit-style verification of S30a collision guards.
 * Run: npx tsx scripts/test-provision-guards.ts
 * No network, no DB, no docker — fake RemoteExec only. Exit 0 = all pass.
 */

import {
  validateSlugFormat,
  checkReservedSlug,
  checkHostCollisions,
  assertProvisionPreflight,
  checkRollbackTargetSafe,
  RESERVED_SLUGS,
  type RemoteExec,
} from './provision-guards';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Fake droplet state mirroring production (2026-08-30 docker ps -a / ls /root)
const LIVE_CONTAINERS = [
  'its-training-openclaw', 'showcase-openclaw', 'frank-openclaw', 'atlas-openclaw',
  'sales-agent-openclaw-gateway-1', 'ceo-openclaw', 'blueprint-openclaw',
  'juanito-openclaw', 'finley-openclaw', 'esry-openclaw', 'relay-openclaw',
  'codie-openclaw', 'emma-openclaw', 'coolify', 'coolify-proxy',
  'n8n-dkw8c8wgko8w0cg4k40g8c0w',
];
const LIVE_DIRS = [
  '/root/.sales-agent', '/root/.showcase-agent', '/root/.its-training-agent',
  '/root/.portal-agent', '/root/.portal-agent-digital-amigos',
];

function fakeSsh(opts?: { failDocker?: boolean }): RemoteExec {
  return {
    async execCommand(cmd: string) {
      if (cmd.startsWith('docker ps -a')) {
        if (opts?.failDocker) return { stdout: '', stderr: 'Cannot connect to the Docker daemon', code: 1 };
        return { stdout: LIVE_CONTAINERS.join('\n'), stderr: '', code: 0 };
      }
      const m = cmd.match(/^test -e (\S+) && echo EXISTS \|\| echo ABSENT$/);
      if (m) return { stdout: LIVE_DIRS.includes(m[1]) ? 'EXISTS' : 'ABSENT', stderr: '', code: 0 };
      return { stdout: '', stderr: `unexpected command: ${cmd}`, code: 127 };
    },
  };
}

async function main() {
  console.log('\n── Layer 1: slug format ──');
  check('valid slug passes', validateSlugFormat('acme-homes') === null);
  check('valid short slug passes', validateSlugFormat('s30test-260830'.slice(0, 40)) === null);
  check('uppercase rejected', validateSlugFormat('Acme') !== null);
  check('spaces rejected (shell-injection vector)', validateSlugFormat('foo bar') !== null);
  check('shell metachars rejected', validateSlugFormat('x;rm -rf /') !== null);
  check('leading hyphen rejected', validateSlugFormat('-acme') !== null);
  check('trailing hyphen rejected', validateSlugFormat('acme-') !== null);
  check('empty rejected', validateSlugFormat('') !== null);
  check('1-char rejected', validateSlugFormat('a') !== null);
  check('41-char rejected', validateSlugFormat('a'.repeat(41)) !== null);

  console.log('\n── Layer 2: reserved-slug blocklist ──');
  // R1 landmine: slug `sales` → rm -rf on live Barnhaus Vanessa volume
  check('THE landmine: "sales" blocked', checkReservedSlug('sales') !== null);
  for (const slug of ['vanessa', 'atlas', 'esry', 'finley', 'relay', 'ceo', 'blueprint', 'codie', 'frank', 'juanito', 'its', 'showcase', 'emma', 'its-training', 'sales-agent', 'tony', 'portal', 'digital-amigos', 'n8n', 'coolify', 'barnhaus', 'empower']) {
    check(`"${slug}" blocked`, checkReservedSlug(slug) !== null);
  }
  check('case/whitespace-insensitive ("  Sales ")', checkReservedSlug('  Sales ') !== null);
  check('clean slug allowed ("acme-homes")', checkReservedSlug('acme-homes') === null);
  check('clean slug allowed ("s30test-260830")', checkReservedSlug('s30test-260830') === null);
  check(`blocklist covers all task-required names`, ['sales', 'vanessa', 'atlas', 'esry', 'finley', 'relay', 'ceo', 'blueprint', 'codie', 'frank', 'juanito', 'its', 'showcase'].every(s => RESERVED_SLUGS.includes(s)));

  console.log('\n── Layer 3: live host checks (fake droplet) ──');
  // Suppose someone deleted `atlas` from the blocklist — host check still catches it
  const atlasErrs = await checkHostCollisions(fakeSsh(), 'atlas');
  check('container collision caught (atlas → atlas-openclaw)', atlasErrs.some(e => e.includes('atlas-openclaw')));
  const salesErrs = await checkHostCollisions(fakeSsh(), 'sales');
  check('dir collision caught (sales → /root/.sales-agent)', salesErrs.some(e => e.includes('/root/.sales-agent')));
  const coolifyErrs = await checkHostCollisions(fakeSsh(), 'coolify');
  check('slug-is-a-container caught (coolify)', coolifyErrs.length > 0);
  const cleanErrs = await checkHostCollisions(fakeSsh(), 'acme-homes');
  check('clean slug passes host checks', cleanErrs.length === 0);
  // Fail closed: docker unavailable → throw, never proceed
  let threw = false;
  try { await checkHostCollisions(fakeSsh({ failDocker: true }), 'acme-homes'); }
  catch { threw = true; }
  check('fails CLOSED when docker ps errors', threw);

  console.log('\n── Full pre-flight (assertProvisionPreflight) ──');
  const expectThrow = async (slug: string, label: string) => {
    try { await assertProvisionPreflight(fakeSsh(), slug); check(label, false, 'did not throw'); }
    catch (e: any) { check(`${label} → "${String(e.message).slice(0, 80)}..."`, true); }
  };
  await expectThrow('atlas', 'slug "atlas" aborts pre-flight');
  await expectThrow('sales', 'slug "sales" aborts pre-flight');
  await expectThrow('foo bar', 'malformed slug aborts pre-flight');
  let cleanOk = true;
  try { await assertProvisionPreflight(fakeSsh(), 'acme-homes'); } catch { cleanOk = false; }
  check('clean slug passes full pre-flight', cleanOk);

  console.log('\n── Rollback defense-in-depth ──');
  check('refuses docker-rm of live gateway', checkRollbackTargetSafe('container', 'sales-agent-openclaw-gateway-1') !== null);
  check('refuses docker-rm of atlas-openclaw', checkRollbackTargetSafe('container', 'atlas-openclaw') !== null);
  check('refuses rm -rf of /root/.sales-agent', checkRollbackTargetSafe('dir', '/root/.sales-agent') !== null);
  check('refuses rm -rf of /root/portal-templates', checkRollbackTargetSafe('dir', '/root/portal-templates') !== null);
  check('refuses rm -rf of off-pattern dir (/root)', checkRollbackTargetSafe('dir', '/root') !== null);
  check('refuses rm -rf of off-pattern dir (/)', checkRollbackTargetSafe('dir', '/') !== null);
  check('allows removal of own container', checkRollbackTargetSafe('container', 'acme-homes-openclaw') === null);
  check('allows removal of own dir', checkRollbackTargetSafe('dir', '/root/.acme-homes-agent') === null);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
