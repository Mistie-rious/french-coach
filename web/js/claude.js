// Direct browser calls to the Claude API with structured JSON output.
// The API key lives only in this device's localStorage — never in the code or the backup file.

const KEY = "anthropic_api_key";
export const MODELS = { main: "claude-sonnet-5-5", fast: "claude-haiku-4-5" };

export const getKey = () => {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
};
export const setKey = (k) => {
  try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch {}
};
export const hasKey = () => !!getKey();

export class ClaudeError extends Error {}

/** Structured outputs need additionalProperties:false and every property required, on every object. */
export function strict(schema) {
  if (schema.type === "object") {
    const props = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, strict(v)]));
    return { ...schema, properties: props, required: Object.keys(props), additionalProperties: false };
  }
  if (schema.type === "array") return { ...schema, items: strict(schema.items) };
  return schema;
}

/** One request; returns the parsed JSON object matching `schema`. `fast` = Haiku (word lookups). */
export async function structured({ system, user, schema, fast = false, maxTokens = 8000 }) {
  const key = getKey();
  if (!key) throw new ClaudeError("No Claude API key (add one in Settings)");
  const body = {
    model: fast ? MODELS.fast : MODELS.main,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: strict(schema) }, ...(fast ? {} : { effort: "medium" }) },
  };
  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ClaudeError("Can't reach Claude (offline?)");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ClaudeError(`Claude API ${resp.status}: ${data?.error?.message || resp.statusText}`);
  if (data.stop_reason === "refusal") throw new ClaudeError("Claude declined this request");
  if (data.stop_reason === "max_tokens") throw new ClaudeError("Claude's answer was cut off");
  const text = data.content?.find((b) => b.type === "text")?.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new ClaudeError("Claude returned something unreadable");
  }
}
