/**
 * POST /api/agents/:agentId/crons/parse
 * Body: { text: string }
 * Returns: { name, scheduleType, scheduleValue, message, tz }
 *
 * Uses Claude Haiku to turn plain English into a structured cron spec.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent } from '@/lib/agent-router';

export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function authCheck(agentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const agent = await getAgent(agentId);
  if (!agent) return null;
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', agent.org_id)
    .single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) return null;
  return { agent, portalUser };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

  const prompt = `Parse the following plain-English description into a structured cron job spec. Return ONLY valid JSON with no markdown, no explanation.

Input: "${text.trim()}"

Return this exact JSON shape:
{
  "name": "Short human-readable name (3-5 words max)",
  "scheduleType": "every" | "cron" | "at",
  "scheduleValue": "cron expression, interval (e.g. 30m, 2h), or ISO datetime",
  "message": "Complete instruction to the AI agent telling it exactly what to do when this fires",
  "tz": "IANA timezone if the user mentioned one (e.g. America/Chicago), or null"
}

Rules:
- scheduleType "cron" for specific times/days (e.g. "every Tuesday at 10am", "daily at 8am", "weekdays at 5pm")
- scheduleType "every" for intervals (e.g. "every 30 minutes", "every 2 hours", "every hour")
- scheduleType "at" for one-time future events (e.g. "next Monday", specific date)
- For "cron": scheduleValue must be a valid 5-field cron expression (min hr dom mon dow)
- For "every": scheduleValue must be a simple interval like 10m, 30m, 1h, 2h, 1d
- message must be a direct, complete instruction to the agent — not a summary. If the user says "remind Larry", write "Remind Larry to follow up on any leads he hasn't contacted in the past 3 days. Post this to his channel."
- Default timezone is America/Chicago if a US context is implied and no timezone is specified
- name should be in Title Case`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return NextResponse.json({ error: 'AI parse failed' }, { status: 500 });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content ?? '';

    // Strip any markdown fences
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.name || !parsed.scheduleType || !parsed.scheduleValue || !parsed.message) {
      return NextResponse.json({ error: 'Incomplete parse result' }, { status: 500 });
    }

    return NextResponse.json({
      name: parsed.name,
      scheduleType: parsed.scheduleType,
      scheduleValue: parsed.scheduleValue,
      message: parsed.message,
      tz: parsed.tz ?? null,
    });
  } catch (e: any) {
    console.error('crons/parse error:', e);
    return NextResponse.json({ error: e.message || 'Parse failed' }, { status: 500 });
  }
}
