/**
 * lib/tools-md-writer.ts
 *
 * After saving integration credentials to agent_env_vars, call
 * syncIntegrationToToolsMd to write/update the relevant section in
 * the agent's workspace TOOLS.md.
 *
 * Also used by the disconnect flow to remove a section.
 */

import { agentReadFile, agentWriteFile, getAgent } from './agent-router';

// ── Section helpers ────────────────────────────────────────────────────────────

/**
 * Find and replace a TOOLS.md section (## Header ... next ## or EOF).
 * Appends if the section doesn't exist yet.
 */
function replaceSection(content: string, sectionHeader: string, newSection: string): string {
  // Normalize newSection — ensure it ends with a single newline
  const normalized = newSection.trimEnd() + '\n';

  // Find existing section
  const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|\n)(${escapedHeader}\n[\\s\\S]*?)(?=\n## |\n$|$)`, 'm');
  const match = content.match(pattern);

  if (match) {
    return content.replace(match[0], match[1] + normalized);
  }

  // Append
  return content.trimEnd() + '\n\n' + normalized;
}

/**
 * Remove a section entirely from TOOLS.md.
 */
function removeSection(content: string, sectionHeader: string): string {
  const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\n${escapedHeader}\n[\\s\\S]*?(?=\n## |\n$|$)`, 'm');
  return content.replace(pattern, '').trimEnd() + '\n';
}

// ── Section renderers — one per integration ────────────────────────────────────

const SECTION_HEADERS: Record<string, string> = {
  resend: '## Email (Resend)',
  telnyx: '## SMS / Voice (Telnyx)',
  assemblyai: '## Transcription (AssemblyAI)',
  openai: '## OpenAI',
  supabase: '## CRM (Supabase)',
  n8n: '## Automation (n8n)',
  google: '## Google (Gmail + Calendar)',
  microsoft365: '## Microsoft 365',
};

function renderSection(integrationId: string, vars: Record<string, string>): string | null {
  switch (integrationId) {
    case 'resend':
      return `## Email (Resend)
- API Key: ${vars.RESEND_API_KEY ?? '(not set)'}
- From: ${vars.RESEND_FROM_EMAIL ?? '(not set)'}
- Endpoint: POST https://api.resend.com/emails
- Quick send:
  \`\`\`bash
  curl -s -X POST https://api.resend.com/emails \\
    -H "Authorization: Bearer ${vars.RESEND_API_KEY ?? 'KEY'}" \\
    -H "Content-Type: application/json" \\
    -d '{"from":"${vars.RESEND_FROM_EMAIL ?? 'from@example.com'}","to":["to@example.com"],"subject":"Subject","html":"<p>Body</p>"}'
  \`\`\``;

    case 'telnyx':
      return `## SMS / Voice (Telnyx)
- API Key: ${vars.TELNYX_API_KEY ?? '(not set)'}
- From Number: ${vars.TELNYX_FROM_NUMBER ?? '(not set)'}
- SMS endpoint: POST https://api.telnyx.com/v2/messages
- Use send_sms.py for outbound SMS drafts`;

    case 'assemblyai':
      return `## Transcription (AssemblyAI)
- API Key: ${vars.ASSEMBLYAI_API_KEY ?? '(not set)'}
${vars.ASSEMBLYAI_CALLBACK_URL ? `- Webhook: ${vars.ASSEMBLYAI_CALLBACK_URL}` : ''}
- Use for: diarized call transcription
- Pricing: ~$0.003/min + $0.00033/min for speaker diarization`;

    case 'openai':
      return `## OpenAI
- API Key: ${vars.OPENAI_API_KEY ?? '(not set)'}
- Endpoint: https://api.openai.com/v1`;

    case 'supabase':
      return `## CRM (Supabase)
- URL: ${vars.SUPABASE_URL ?? '(not set)'}
- Service Role Key: ${vars.SUPABASE_SERVICE_KEY ?? '(not set)'}
- Tables: contacts, notes, activities, tasks, deals
- Quick query:
  \`\`\`bash
  curl -s "${vars.SUPABASE_URL ?? 'https://xxx.supabase.co'}/rest/v1/contacts?limit=5" \\
    -H "Authorization: Bearer ${vars.SUPABASE_SERVICE_KEY ?? 'KEY'}" \\
    -H "apikey: ${vars.SUPABASE_SERVICE_KEY ?? 'KEY'}"
  \`\`\``;

    case 'n8n':
      return `## Automation (n8n)
- URL: ${vars.N8N_URL ?? '(not set)'}
- API Key: ${vars.N8N_API_KEY ?? '(not set)'}`;

    case 'google':
      return `## Google (Gmail + Calendar)
- Account: ${vars.GOOGLE_ACCOUNT_EMAIL ?? '(not set)'}
- Token: /home/node/.openclaw/workspace/google_token.json
- Scopes: gmail.modify, gmail.send, calendar, drive`;

    case 'microsoft365':
      return `## Microsoft 365
- Client ID: ${vars.MS_CLIENT_ID ?? '(not set)'}
- Tenant: ${vars.MS_TENANT_ID ?? 'common'}
- Token: /home/node/.openclaw/workspace/ms_token.json`;

    default:
      return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Write or update an integration's section in the agent's TOOLS.md.
 * Safe to call after any env-vars POST.
 */
export async function syncIntegrationToToolsMd(
  agentId: string,
  integrationId: string,
  vars: Record<string, string>
): Promise<void> {
  const section = renderSection(integrationId, vars);
  if (!section) return; // unknown integration — skip

  const header = SECTION_HEADERS[integrationId];
  if (!header) return;

  let current = '';
  try {
    current = await agentReadFile(agentId, 'TOOLS.md');
  } catch {
    // File doesn't exist yet — start fresh
    current = '# TOOLS.md - Integration Notes\n';
  }

  const updated = replaceSection(current, header, section);
  await agentWriteFile(agentId, 'TOOLS.md', updated);
}

/**
 * Remove an integration's section from TOOLS.md (called on disconnect).
 */
export async function removeIntegrationFromToolsMd(
  agentId: string,
  integrationId: string
): Promise<void> {
  const header = SECTION_HEADERS[integrationId];
  if (!header) return;

  let current = '';
  try {
    current = await agentReadFile(agentId, 'TOOLS.md');
  } catch {
    return; // nothing to remove
  }

  const updated = removeSection(current, header);
  await agentWriteFile(agentId, 'TOOLS.md', updated);
}
