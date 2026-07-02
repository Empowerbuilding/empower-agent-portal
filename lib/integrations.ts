/**
 * lib/integrations.ts — Integration registry
 * Defines all supported integrations and their required fields.
 * Add a new entry here to make it available in the UI automatically.
 */

export interface IntegrationField {
  key: string;           // env var key stored in agent_env_vars
  label: string;         // UI label
  type: 'text' | 'password' | 'email' | 'url';
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'email' | 'sms' | 'ai' | 'database' | 'productivity' | 'voice' | 'automation';
  fields: IntegrationField[];
  docsUrl?: string;
  note?: string;
  authType?: 'apikey' | 'oauth';  // oauth = separate flow, not built yet
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'resend',
    name: 'Resend',
    description: 'Transactional email sending',
    icon: '✉️',
    category: 'email',
    fields: [
      { key: 'RESEND_API_KEY', label: 'API Key', type: 'password', placeholder: 're_...', required: true },
      { key: 'RESEND_FROM_EMAIL', label: 'Default From Address', type: 'email', placeholder: 'agent@yourdomain.com', required: true },
    ],
    docsUrl: 'https://resend.com/api-keys',
  },
  {
    id: 'telnyx',
    name: 'Telnyx',
    description: 'SMS and voice calls',
    icon: '📱',
    category: 'sms',
    fields: [
      { key: 'TELNYX_API_KEY', label: 'API Key', type: 'password', placeholder: 'KEY...', required: true },
      { key: 'TELNYX_FROM_NUMBER', label: 'From Phone Number', type: 'text', placeholder: '+18005551234', required: true, hint: 'E.164 format' },
    ],
    docsUrl: 'https://developers.telnyx.com',
  },
  {
    id: 'assemblyai',
    name: 'AssemblyAI',
    description: 'Call transcription and speaker diarization',
    icon: '🎙️',
    category: 'voice',
    fields: [
      { key: 'ASSEMBLYAI_API_KEY', label: 'API Key', type: 'password', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: true },
      { key: 'ASSEMBLYAI_CALLBACK_URL', label: 'Webhook Callback URL', type: 'url', placeholder: 'https://n8n.example.com/webhook/assemblyai', hint: 'n8n webhook that receives transcript results' },
    ],
    docsUrl: 'https://www.assemblyai.com/app',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models, embeddings, and image generation',
    icon: '🤖',
    category: 'ai',
    fields: [
      { key: 'OPENAI_API_KEY', label: 'API Key', type: 'password', placeholder: 'sk-proj-...', required: true },
    ],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database and CRM backend',
    icon: '🗄️',
    category: 'database',
    fields: [
      { key: 'SUPABASE_URL', label: 'Project URL', type: 'url', placeholder: 'https://xxxx.supabase.co', required: true },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Service Role Key', type: 'password', placeholder: 'eyJ...', required: true },
    ],
    docsUrl: 'https://supabase.com/dashboard/project/_/settings/api',
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Automation workflows and webhooks',
    icon: '⚙️',
    category: 'automation',
    fields: [
      { key: 'N8N_BASE_URL', label: 'n8n Instance URL', type: 'url', placeholder: 'https://n8n.yourdomain.com', required: true },
      { key: 'N8N_API_KEY', label: 'API Key', type: 'password', placeholder: 'eyJ...' },
    ],
    docsUrl: 'https://docs.n8n.io/api/',
  },
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Gmail, Calendar, and Drive',
    icon: '📧',
    category: 'productivity',
    authType: 'oauth',
    fields: [
      { key: 'GOOGLE_CLIENT_ID', label: 'OAuth Client ID', type: 'text', placeholder: 'xxx.apps.googleusercontent.com', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'OAuth Client Secret', type: 'password', required: true },
    ],
    note: 'Create an OAuth 2.0 app in Google Cloud Console. Add redirect URI: https://portal.empowerbuilding.ai/api/oauth/google/callback',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    id: 'microsoft365',
    name: 'Microsoft 365',
    description: 'Outlook, Calendar, and Teams',
    icon: '🔵',
    category: 'productivity',
    authType: 'oauth',
    fields: [
      { key: 'MS_CLIENT_ID', label: 'Azure App Client ID', type: 'text', required: true },
      { key: 'MS_CLIENT_SECRET', label: 'Azure App Client Secret', type: 'password', required: true },
      { key: 'MS_TENANT_ID', label: 'Tenant ID', type: 'text', placeholder: 'common', hint: 'Use "common" for multi-tenant' },
    ],
    note: 'Register an app in Azure Entra ID (portal.azure.com). Add redirect URI: https://portal.empowerbuilding.ai/api/oauth/microsoft/callback',
    docsUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
  },
];

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS & Voice' },
  { id: 'ai', label: 'AI' },
  { id: 'database', label: 'Database' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'automation', label: 'Automation' },
] as const;

export function getIntegration(id: string): Integration | undefined {
  return INTEGRATIONS.find(i => i.id === id);
}
