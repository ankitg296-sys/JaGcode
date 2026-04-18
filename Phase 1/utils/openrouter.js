const fetch = require("node-fetch");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Call OpenRouter chat completions API.
 * @param {Array} messages - Array of {role, content} message objects
 * @param {Object} opts - Optional overrides: model, temperature, max_tokens
 * @returns {string} - The assistant's reply content
 */
async function chat(messages, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in .env");

  const model = opts.model || process.env.MODEL || "mistralai/mistral-nemo";

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.max_tokens ?? 2048,
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://talentmatch.ai",
      "X-Title": "TalentMatch AI",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    throw new Error("Unexpected API response: " + JSON.stringify(data));
  }

  return data.choices[0].message.content.trim();
}

/**
 * Call the LLM and parse the response as JSON.
 * Strips markdown code fences if present.
 */
async function chatJSON(messages, opts = {}) {
  const raw = await chat(messages, { ...opts, temperature: 0.1 });

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to extract first JSON object or array from the response
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {}
    }
    throw new Error(`Failed to parse LLM response as JSON.\nRaw: ${raw}\nError: ${e.message}`);
  }
}

module.exports = { chat, chatJSON };
