'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const STEP_ORDER = [
  'creating_org',
  'creating_agent',
  'provisioning_phone',
  'provisioning_crm',
  'creating_channels',
  'creating_users',
  'cloning_workspace',
  'writing_files',
  'starting_container',
  'waiting_ready',
  'seeding_crons',
  'complete',
];

const STEP_LABELS: Record<string, string> = {
  creating_org:          'Creating organization',
  creating_agent:        'Setting up agent profile',
  provisioning_phone:    'Acquiring phone number',
  provisioning_crm:      'Creating CRM database',
  creating_channels:     'Setting up portal channels',
  creating_users:        'Creating rep accounts',
  cloning_workspace:     'Cloning agent workspace',
  writing_files:         'Writing configuration files',
  starting_container:    'Starting agent container',
  waiting_ready:         'Waiting for agent to come online',
  seeding_crons:         'Seeding automations',
  complete:              'Agent is live 🎉',
};

interface Job {
  id: string;
  org_slug: string;
  org_name: string;
  status: 'running' | 'complete' | 'failed';
  current_step: string;
  steps_completed: string[];
  error?: string;
  org_id?: string;
}

function ProvisionProgressInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get('jobId');
  const orgSlug = searchParams.get('orgSlug');

  const [job, setJob] = useState<Job | null>(null);
  const [dots, setDots] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/provision/${jobId}`);
        if (!res.ok) return;
        const data: Job = await res.json();
        setJob(data);
        if (data.status === 'complete') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Redirect after a short delay
          setTimeout(() => router.push(`/${data.org_slug}/general`), 2000);
        } else if (data.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // ignore
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId, router]);

  const completedSet = new Set(job?.steps_completed ?? []);
  const currentStep = job?.current_step ?? 'creating_org';
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const totalSteps = STEP_ORDER.length - 1; // exclude 'complete'
  const progressPct = job?.status === 'complete' ? 100 : Math.round((completedSet.size / totalSteps) * 100);

  if (!jobId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">No job ID provided.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {job?.status === 'complete' ? 'Agent is ready!' : `Setting up ${job?.org_name ?? orgSlug ?? 'your agent'}${dots}`}
          </h1>
          <p className="text-gray-400 text-sm">
            {job?.status === 'complete'
              ? 'Redirecting to your portal...'
              : 'This takes about 2–3 minutes. Hang tight.'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-2 mb-8">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEP_ORDER.filter(s => s !== 'complete').map((step, i) => {
            const done = completedSet.has(step);
            const active = step === currentStep && job?.status === 'running';
            const pending = !done && !active;

            return (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                  ${done ? 'bg-green-500 text-white' :
                    active ? 'bg-blue-500 text-white animate-pulse' :
                    'bg-gray-700 text-gray-500'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${done ? 'text-green-400' : active ? 'text-white' : 'text-gray-500'}`}>
                  {STEP_LABELS[step]}
                  {active && <span className="text-gray-400">{dots}</span>}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error state */}
        {job?.status === 'failed' && (
          <div className="mt-8 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 text-sm font-semibold mb-1">Provisioning failed</p>
            <p className="text-red-300 text-xs font-mono">{job.error}</p>
            <p className="text-gray-400 text-xs mt-2">All resources have been automatically cleaned up. You can try again.</p>
            <button
              onClick={() => router.push('/onboarding')}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProvisionProgressPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <ProvisionProgressInner />
    </Suspense>
  );
}
