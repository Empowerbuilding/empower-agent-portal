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

const GEMINI_MODEL = 'gemini-3-flash-preview';

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

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: VOCAB_PROMPT },
              { inlineData: { mimeType, data: bytes } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.error('[transcribe] Gemini error', r.status, errText.slice(0, 300));
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  const d = await r.json();
  const text: string =
    d?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim() ?? '';

  return NextResponse.json({ text });
}
