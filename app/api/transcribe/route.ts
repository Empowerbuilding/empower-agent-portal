import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPortalClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// Domain vocabulary — steers the transcription model toward our terms
// (browser speech recognition could never do this)
const VOCAB_PROMPT =
  'Portal chat for a custom home design company. Common terms: Barnhaus, barndominium, ' +
  'Empower Building, Showcase Builders, CW Custom Builders, Modern Dwellings, ' +
  'Juanito, Vanessa, Atlas, Esry, Finley, Relay, Codie, Blueprint, ' +
  'Michael, Mitch, Mitchell, Larry, Shannon, Zunaira, Arooba, ' +
  'render, Revit, floor plan, elevation, D1, D2, D3 revision, punch list, ' +
  'steel frame, Spring Mountain, study set, design concierge, CRM, lead, deal.';

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
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio too large (max 25 MB)' }, { status: 413 });
  }

  const fd = new FormData();
  fd.append('file', audio, audio.name || 'voice.webm');
  fd.append('model', 'gpt-4o-mini-transcribe');
  fd.append('language', 'en');
  fd.append('prompt', VOCAB_PROMPT);

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: fd,
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.error('[transcribe] OpenAI error', r.status, errText.slice(0, 300));
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  const d = await r.json();
  return NextResponse.json({ text: (d.text ?? '').trim() });
}
