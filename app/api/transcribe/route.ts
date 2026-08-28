import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// Domain vocabulary — steers the transcription model toward our terms
const VOCAB_PROMPT =
  'You are a speech-to-text engine. Transcribe the attached audio verbatim into plain English text. ' +
  'Output ONLY the transcription — no commentary, no labels, no quotes. ' +
  'If there is no discernible speech, output nothing at all. ' +
  'Context: portal chat for a custom home design company. Common terms: Barnhaus, barndominium, ' +
  'Empower Building, Showcase Builders, CW Custom Builders, Modern Dwellings, ' +
  'Juanito, Vanessa, Atlas, Esry, Finley, Relay, Codie, Blueprint, ' +
  'Michael, Mitch, Mitchell, Larry, Shannon, Zunaira, Arooba, ' +
  'render, Revit, floor plan, elevation, D1, D2, D3 revision, punch list, ' +
  'steel frame, Spring Mountain, study set, design concierge, CRM, lead, deal.';

// gemini-3-flash-preview intermittently stalled 40s+ on audio (verified 2026-08-27) —
// 2.5-flash transcribes the same clips in ~1s with identical accuracy. Stay on stable.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 20_000; // per attempt; normal transcription is ~1-3s

export async function POST(req: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let audio: File | null = null;
  try {
    const formData = await req.formData();
    audio = formData.get('audio') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: 'Missing audio' }, { status: 400 });
  }
  if (audio.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio too large (max 20 MB)' }, { status: 413 });
  }

  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    console.error('[transcribe] GOOGLE_AI_STUDIO_KEY not set');
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  const mimeType = audio.type?.split(';')[0] || 'audio/webm';
  const bytes = Buffer.from(await audio.arrayBuffer()).toString('base64');

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: VOCAB_PROMPT },
          { inlineData: { mimeType, data: bytes } },
        ],
      },
    ],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });

  // Two attempts with a hard timeout each — the preview model occasionally hangs
  // or returns an empty candidate; without this the request stalled indefinitely.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let r: Response;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        }
      );
    } catch (e) {
      console.error(`[transcribe] Gemini attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
      continue;
    }

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error(`[transcribe] Gemini error (attempt ${attempt})`, r.status, errText.slice(0, 300));
      // 4xx other than 429 won't get better on retry
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
      continue;
    }

    const d = await r.json().catch(() => null);
    const text: string =
      d?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim() ?? '';

    const finishReason: string | undefined = d?.candidates?.[0]?.finishReason;
    if (!text && finishReason && finishReason !== 'STOP') {
      console.error(`[transcribe] empty result, finishReason=${finishReason} (attempt ${attempt})`);
      continue; // flaky/blocked candidate — retry once
    }

    return NextResponse.json({ text });
  }

  return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
}
