import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingWizard from './OnboardingWizard';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard: if the user is already a member of an org,
 * send them there instead of showing the new-org wizard.
 * Exception: ?new=1 means the user explicitly clicked "New Organization" — skip the redirect.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ?new=1 = user explicitly clicked "New Organization" — bypass the redirect
  const params = await searchParams;
  const forceNew = params?.new === '1';

  if (!forceNew) {
    const { data: portalUsers } = await supabase
      .from('portal_users')
      .select('org_id, organizations(slug)')
      .eq('supabase_auth_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (portalUsers) {
      const org = (portalUsers.organizations as unknown) as { slug: string } | null;
      if (org?.slug) {
        redirect(`/${org.slug}`);
      }
      // Has a row but no org slug — fall through to wizard (edge case)
    }
  }

  return <OnboardingWizard />;
}
