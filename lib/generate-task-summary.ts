export async function generateTaskSummary(title: string, description?: string | null): Promise<string> {
  const prompt = `Write a single short sentence (max 90 characters) describing this CRM task in plain English. No markdown, no quotes, no punctuation at the end unless natural. Be specific and useful — mention the person's name if in the title, the action needed, and any key detail from the description.

Title: ${title}
Description: ${description ? description.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s*/g, '').slice(0, 400) : 'none'}

Reply with ONLY the summary sentence, nothing else.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
      temperature: 0.3,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? title
}
