import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Organization } from '@/lib/types';

export function getCrmClient(org: Organization) {
  if (!org.crm_supabase_url || !org.crm_supabase_key) return null;
  return createSupabaseClient(org.crm_supabase_url, org.crm_supabase_key);
}
