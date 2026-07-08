/**
 * lib/integrations.ts — Integration registry
 * Defines supported integrations and their required fields.
 */

export interface IntegrationField {
  key: string;
  label: string;
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
  category: 'email' | 'sms' | 'database' | 'productivity';
  fields: IntegrationField[];
  docsUrl?: string;
  note?: string;
  authType?: 'apikey' | 'oauth';
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
    id: 'supabase',
    name: 'Supabase (CRM)',
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
    id: 'google',
    name: 'Google Workspace',
    description: 'Gmail, Calendar, and Drive',
    icon: '📧',
    category: 'productivity',
    authType: 'oauth',
    fields: [],
    note: 'Connect via OAuth — click Connect to authorize your Google account.',
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
    note: 'Register an app in Azure Entra ID. Add redirect URI: https://portal.empowerbuilding.ai/api/oauth/microsoft/callback',
    docsUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
  },
];

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS & Voice' },
  { id: 'database', label: 'CRM' },
  { id: 'productivity', label: 'Productivity' },
] as const;

export function getIntegration(id: string): Integration | undefined {
  return INTEGRATIONS.find(i => i.id === id);
}
