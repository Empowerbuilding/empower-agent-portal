import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const PORTAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PORTAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.GOOGLE_AI_STUDIO_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId, inboundText, contactName, contactPhone, repName, conversationHistory } = await req.json();
    if (!channelId || !inboundText) {
      return NextResponse.json({ error: 'channelId and inboundText required' }, { status: 400 });
    }

    const portal = createServiceClient(PORTAL_URL, PORTAL_SERVICE_KEY, { auth: { persistSession: false } });

    // Look up channel → org + agent
    const { data: channel } = await portal
      .from('portal_channels')
      .select('org_id, agent_id, agents(display_name)')
      .eq('id', channelId)
      .single();

    const orgId = channel?.org_id;
    const agentName = (channel?.agents as any)?.display_name || 'Vanessa';

    // Look up org → name + CRM credentials
    const { data: org } = await portal
      .from('organizations')
      .select('name, crm_supabase_url, crm_supabase_key')
      .eq('id', orgId)
      .single();

    const orgName = org?.name || 'the company';

    // Quick CRM lookup for contact context (best effort — don't fail if unavailable)
    let contactContext = '';
    if (org?.crm_supabase_url && org?.crm_supabase_key && contactPhone) {
      try {
        const crm = createServiceClient(org.crm_supabase_url, org.crm_supabase_key, { auth: { persistSession: false } });
        const digits = contactPhone.replace(/\D/g, '').slice(-10);
        const { data: contacts } = await crm
          .from('contacts')
          .select('id, full_name, lifecycle_stage, notes, lead_source')
          .ilike('phone', `%${digits}%`)
          .limit(1);
        if (contacts?.[0]) {
          const c = contacts[0];
          const parts = [];
          if (c.lifecycle_stage) parts.push(`stage: ${c.lifecycle_stage}`);
          if (c.lead_source) parts.push(`source: ${c.lead_source}`);
          if (c.notes) parts.push(`notes: ${c.notes.slice(0, 300)}`);
          if (parts.length) contactContext = `Contact context: ${parts.join(' | ')}`;
        }
      } catch {
        // CRM lookup failure is non-fatal
      }
    }

    // Build conversation context from history (last 6 messages)
    let historyText = '';
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      historyText = recent
        .map((m: any) => {
          const dir = m.metadata?.direction === 'inbound' ? `${contactName || 'Contact'}` : `${repName || 'Rep'}`;
          const body = (m.content || '').replace(/```\n([\s\S]*?)\n```/, '$1').trim().slice(0, 200);
          return `${dir}: ${body}`;
        })
        .join('\n');
    }

    // Build the prompt
    const systemPrompt = `You are ${agentName}, a sales AI assistant for ${orgName}. You are drafting a short SMS reply for ${repName || 'the sales rep'} to send to ${contactName || 'a lead'}.

Rules:
- Write ONLY the message text — no labels, no quotes, no formatting
- Keep it under 160 characters
- Sound natural and human, like a real person texting
- Match the tone of the conversation — casual if they're casual, professional if they're professional
- Never mention AI, automation, or that this was drafted for them
- Be direct and helpful`;

    const userPrompt = [
      historyText ? `Recent conversation:\n${historyText}` : '',
      contactContext,
      `\nInbound message from ${contactName || 'contact'}:\n${inboundText}`,
      `\nDraft a reply for ${repName || 'the rep'} to send.`,
    ].filter(Boolean).join('\n\n');

    // Call Gemini Flash — same model Vanessa runs on
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
        }),
      }
    );

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('[sms/draft] Gemini error:', aiRes.status, err);
      return NextResponse.json({ error: 'Draft generation failed' }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const draft = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    return NextResponse.json({ draft });
  } catch (err: any) {
    console.error('[sms/draft] ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
