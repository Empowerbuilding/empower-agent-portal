import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingWizard from './OnboardingWizard';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard: if the user is already a member of an org,
 * send them there instead of showing the new-org wizard.
 * ?new=1 bypasses the redirect — used when an existing user explicitly
 * clicks "New Organization" from the org picker.
 * Without that param, existing members (Larry, Shannon, etc.) get bounced
 * back to their org so they don't land on the wizard by accident.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ?new=1 = user explicitly clicked "New Organization" — skip the guard
  const params = await searchParams;
  if (params?.new === '1') {
    return <OnboardingWizard />;
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
    // Has a portal_users row but org join came back null — redirect to home
    // rather than dropping an existing member into the new-org wizard.
    redirect('/');
  }

  return <OnboardingWizard />;
}
