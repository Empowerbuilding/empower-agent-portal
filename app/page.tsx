import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get all orgs this user belongs to
  const { data: portalUsers } = await supabase
    .from('portal_users')
    .select('org_id, role, organizations(slug)')
    .eq('supabase_auth_id', user.id)
    .order('created_at', { ascending: false });

  if (!portalUsers || portalUsers.length === 0) {
    // Logged in but no org yet — send to onboarding wizard
    redirect('/onboarding');
  }

  // Always show picker — lets user switch orgs or create a new one
  const orgs = portalUsers
    .map(pu => (pu.organizations as unknown) as { slug: string } | null)
    .filter(Boolean) as { slug: string }[];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #1a1b1e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'var(--surface, #26272b)', border: '1px solid var(--border, #3a3b3e)', borderRadius: '12px', padding: '32px', minWidth: '320px' }}>
        <div style={{ fontWeight: 700, fontSize: '18px', color: '#fff', marginBottom: '8px' }}>Choose a workspace</div>
        <div style={{ color: '#999', fontSize: '13px', marginBottom: '24px' }}>Select which org to open</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {orgs.map(org => (
            <a key={org.slug} href={`/${org.slug}`} style={{
              display: 'block', padding: '12px 16px', background: '#2e2f33', border: '1px solid #3a3b3e',
              borderRadius: '8px', color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}>
              {org.slug}
            </a>
          ))}
          <a href="/onboarding" style={{
            display: 'block', padding: '12px 16px', background: 'none', border: '1px dashed #3a3b3e',
            borderRadius: '8px', color: '#888', textDecoration: 'none', fontSize: '13px', textAlign: 'center', marginTop: '8px',
          }}>
            + New organization
          </a>
        </div>
      </div>
    </div>
  );
}
