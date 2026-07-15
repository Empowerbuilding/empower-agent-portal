import { createClient } from '@/lib/supabase/server';
import CrmSubNav from './CrmSubNav';

interface Props {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function CrmLayout({ children, params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('slug, crm_mode').eq('slug', orgSlug).single();

  const crmMode = org?.crm_mode ?? 'b2b';

  const b2cTabs = [
    { label: 'Contacts', href: `/${orgSlug}/crm/contacts` },
    { label: 'Pipeline', href: `/${orgSlug}/crm/pipeline` },
    { label: 'Deals', href: `/${orgSlug}/crm/deals` },
    { label: 'Tasks', href: `/${orgSlug}/crm/tasks` },
    { label: 'Companies', href: `/${orgSlug}/crm/companies` },
    { label: 'Cross-sell', href: `/${orgSlug}/crm/cross-sell` },
  ];

  const b2bTabs = [
    { label: 'Companies', href: `/${orgSlug}/crm`, exact: true },
    { label: 'Pipeline', href: `/${orgSlug}/crm/deals` },
    { label: 'Tasks', href: `/${orgSlug}/crm/tasks` },
  ];

  const tabs = crmMode === 'b2c' ? b2cTabs : b2bTabs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <CrmSubNav tabs={tabs} orgSlug={orgSlug} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
