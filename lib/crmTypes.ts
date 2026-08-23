// Org-aware CRM client/company type options.
// Default list matches the Barnhaus/home-builder vertical.
// Add an entry to ORG_TYPES for orgs in a different vertical (e.g. ITS = OQ compliance / energy).

export interface TypeOption {
  value: string;
  label: string;
}

const DEFAULT_TYPES: TypeOption[] = [
  { value: 'builder', label: 'Builder' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'architect', label: 'Architect' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'o&g', label: 'O&G' },
  { value: 'pool_builder', label: 'Pool Builder' },
];

const ORG_TYPES: Record<string, TypeOption[]> = {
  'its-training': [
    { value: 'operator', label: 'Operator' },
    { value: 'contractor', label: 'Contractor' },
    { value: 'utility', label: 'Utility' },
    { value: 'midstream', label: 'Midstream' },
    { value: 'municipality', label: 'Municipality' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'other', label: 'Other' },
  ],
};

export function getClientTypeOptions(orgSlug: string): TypeOption[] {
  return ORG_TYPES[orgSlug] ?? DEFAULT_TYPES;
}
