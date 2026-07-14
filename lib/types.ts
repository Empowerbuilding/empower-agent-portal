export type ChannelType = 'chat' | 'feed' | 'approval' | 'sms';

export interface AgentGroup {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  emoji: string | null;
  sort_order: number;
}
export type SenderType = 'user' | 'agent' | 'system';
export type ContainerStatus = 'running' | 'stopped' | 'unhealthy' | 'error' | 'provisioning';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  plan: string;
  active: boolean;
  created_at: string;
  crm_supabase_url?: string | null;
  crm_supabase_key?: string | null;
  crm_mode?: string | null;
}

export interface Agent {
  id: string;
  org_id: string;
  template_id: string;
  name: string;
  display_name: string;
  container_name: string | null;
  container_status: ContainerStatus;
  soul_md: string | null;
  agents_md: string | null;
  tools_md: string | null;
  memory_md: string | null;
  active: boolean;
  created_at: string;
  group_id: string | null;
  agent_groups?: AgentGroup | null;
}

export interface PortalChannel {
  id: string;
  org_id: string;
  agent_id: string;
  name: string;
  display_name: string;
  channel_type: ChannelType;
  icon: string | null;
  description: string | null;
  position: number;
  active: boolean;
}

export interface PortalMessage {
  id: string;
  channel_id: string;
  org_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
  processed: boolean;
  created_at: string;
}

export interface Attachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface PortalUser {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'rep';
  active: boolean;
  last_active_at?: string | null;
}

export interface ChannelWithAgent extends PortalChannel {
  agent: Agent;
}
