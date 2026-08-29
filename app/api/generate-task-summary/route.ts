/**
 * POST /api/generate-task-summary
 * Body: { title: string, description?: string | null }
 * Returns: { summary: string }
 *
 * Server-side wrapper so the OpenAI key never reaches the client bundle.
 * Used by task create/update flows to populate tasks.ai_summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTaskSummary } from '@/lib/generate-task-summary';
import { requireUser } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Require login — this route burns OpenAI quota; was fully anon.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rl = checkRateLimit(auth.userId, { key: 'task-summary', limit: 60, windowMs: 60_000 });
  if (rl) return rl;

  const { title, description } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

  try {
    const summary = await generateTaskSummary(title.trim(), description ?? null);
    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error('generate-task-summary error:', e);
    return NextResponse.json({ summary: title.trim() }, { status: 200 });
  }
}
