/**
 * run-provision.ts — CLI runner for provisionOrg()
 * Usage: npx tsx scripts/run-provision.ts
 */

import { provisionOrg } from './provision-org';

async function main() {
  console.log('[runner] Starting ITS Training provisioning...\n');

  const result = await provisionOrg(
    {
      orgName:              'ITS Training',
      orgSlug:              'its-training',
      ownerEmail:           'mitchell@empowerbuilding.ai',
      ownerName:            'Mitchell',
      ownerSupabaseAuthId:  'a0e7a749-e211-4f33-956c-1dfbf45b61ec',
      agentDisplayName:     'Tony',
      agentTone:            'Professional',
      industry:             'OQ Compliance / Energy Sector Training',
      whatWeSell:           'Operator Qualification compliance solutions for natural gas, liquids, and propane pipeline companies. DOT/PHMSA compliance training, software, and managed services.',
      website:              'https://its-training.com',
      companyKnowledge:     'ITS is a family-owned OQ compliance company founded in 1989. Serves natural gas, liquids, and propane pipeline operators across the US. Clients include some of the world\'s largest energy providers. Known for long-term partnerships (20+ years with some clients). Led by Susan Sammons and Stephanie Balmer.',
      reps:                 [],   // No reps yet — add later
      textbeeApiKey:        process.env.TEXTBEE_API_KEY,
      textbeeDeviceId:      '6a70016f6027b8b819f96f75',
      textbeePhoneNumber:   '+17134312715',
      textbeeSimSlot:       0,
      telnyxDid:            '+17138320994',
      features:             ['crm'],  // No render/gallery/files — pure sales org
    },
    (step, detail) => {
      console.log(`  ▶ ${step}${detail ? ': ' + detail : ''}`);
    }
  );

  if (result.success) {
    console.log('\n✅ Provisioning complete!');
    console.log('   Org ID:   ', result.orgId);
    console.log('   Agent ID: ', result.agentId);
    console.log('   Org Slug: ', result.orgSlug);
  } else {
    console.error('\n❌ Provisioning failed:', result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[runner] Unhandled error:', err);
  process.exit(1);
});
