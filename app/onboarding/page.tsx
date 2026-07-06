import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingWizard from './OnboardingWizard';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard: if the user is already a member of an org,
 * send them there instead of showing the new-org wizard.
 * This prevents existing members (Larry, Shannon, etc.) from getting
 * stuck on the onboarding screen if they land here via a bad redirect
 * or direct URL.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

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

  return <OnboardingWizard />;
}
