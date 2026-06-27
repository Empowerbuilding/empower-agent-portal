import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get the user's org slug and redirect to their portal
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('org_id, role, organizations(slug)')
    .eq('supabase_auth_id', user.id)
    .single();

  if (!portalUser) {
    redirect('/login');
  }

  // Admins go to admin panel, reps go to their org
  const org = (portalUser.organizations as unknown) as { slug: string } | null;
  if (org?.slug) {
    redirect(`/${org.slug}`);
  }

  redirect('/login');
}
