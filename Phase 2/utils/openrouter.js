const fetch = require("node-fetch");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

async function chat(messages, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in .env");

  const model = opts.model || process.env.MODEL || "mistralai/mistral-nemo";

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://talentmatch.ai",
      "X-Title": "TalentMatch AI",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (!data.choices?.[0]) throw new Error("Unexpected API response: " + JSON.stringify(data));
  return data.choices[0].message.content.trim();
}

async function chatJSON(messages, opts = {}) {
  const raw = await chat(messages, { ...opts, temperature: 0.1 });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) {
      try { return JSON.parse(m[1]); } catch {}
    }
    throw new Error(`Failed to parse LLM JSON.\nRaw: ${raw}`);
  }
}

module.exports = { chat, chatJSON };
