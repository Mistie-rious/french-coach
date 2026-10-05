// Direct browser calls to the Claude API with structured JSON output.
// The API key lives only in this device's localStorage — never in the code or the backup file.
import { all, kvGet, kvSet, run } from "./db.js";
import { dayStart, localDate, toast } from "./util.js";

const KEY = "anthropic_api_key";
export const MODEL = "claude-haiku-4-5";
const PRICE = { input: 1 / 1e6, output: 5 / 1e6 }; // USD per token for Haiku 4.5

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

/**
 * One request; returns the parsed JSON object matching `schema`. `purpose` labels it in the usage meter.
 * `think` > 0 gives Claude that many tokens to reason before answering (billed as output).
 */
export async function structured({ system, user, schema, purpose = "other", maxTokens = 4000, think = 0 }) {
  const key = getKey();
  if (!key) throw new ClaudeError("No Claude API key (add one in Settings)");
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: strict(schema) } },
  };
  if (think) {
    body.thinking = { type: "enabled", budget_tokens: think };
    body.max_tokens = maxTokens + think;
  }
  let { resp, data } = await send(key, body);
  if (think && resp.status === 400) {
    // Safety net: if thinking is ever rejected for this request, answer without it rather than fail.
    console.warn("Request with thinking rejected, retrying without", data?.error?.message);
    delete body.thinking;
    body.max_tokens = maxTokens;
    ({ resp, data } = await send(key, body));
  }
  if (!resp.ok) throw new ClaudeError(`Claude API ${resp.status}: ${data?.error?.message || resp.statusText}`);
  if (data.usage) logUsage(purpose, data.usage);
  if (data.stop_reason === "refusal") throw new ClaudeError("Claude declined this request");
  if (data.stop_reason === "max_tokens") throw new ClaudeError("Claude's answer was cut off");
  const text = data.content?.find((b) => b.type === "text")?.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new ClaudeError("Claude returned something unreadable");
  }
}

/**
 * One turn of a free-text chat. `messages` are raw API messages; `tools` (optional) lets Claude ask us to do things.
 * Returns {text, content, toolUses}: `content` is the assistant message to append to the history as-is,
 * `toolUses` is [{id, name, input}] to run and answer with tool_result blocks.
 */
export async function converse({ system, messages, tools, purpose = "ask", maxTokens = 900 }) {
  const key = getKey();
  if (!key) throw new ClaudeError("No Claude API key (add one in Settings)");
  const body = { model: MODEL, max_tokens: maxTokens, system, messages };
  if (tools) body.tools = tools;
  const { resp, data } = await send(key, body);
  if (!resp.ok) throw new ClaudeError(`Claude API ${resp.status}: ${data?.error?.message || resp.statusText}`);
  if (data.usage) logUsage(purpose, data.usage);
  if (data.stop_reason === "refusal") throw new ClaudeError("Claude declined this request");
  const content = data.content || [];
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const toolUses = content.filter((b) => b.type === "tool_use").map(({ id, name, input }) => ({ id, name, input }));
  if (!text && !toolUses.length) throw new ClaudeError("Claude returned an empty answer");
  return { text, content, toolUses };
}

async function send(key, body) {
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
  return { resp, data: await resp.json().catch(() => ({})) };
}

// ---------- usage meter ----------

function logUsage(purpose, u) {
  try {
    run("INSERT INTO llm_usage(purpose, model, input_tokens, output_tokens, created_at) VALUES (?,?,?,?,?)", [
      purpose, MODEL, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), u.output_tokens || 0, Date.now(),
    ]);
    nudgeIfOverGoal();
  } catch (e) {
    console.warn("usage log failed", e);
  }
}

/** Spend since `since` (ms) grouped by purpose: [{purpose, calls, cost}] plus total. */
export function usageSince(since) {
  const rows = all(
    `SELECT purpose, COUNT(*) AS calls, SUM(input_tokens) AS inp, SUM(output_tokens) AS outp
     FROM llm_usage WHERE created_at >= ? GROUP BY purpose ORDER BY SUM(output_tokens) DESC`,
    [since],
  ).map((r) => ({ purpose: r.purpose, calls: r.calls, cost: r.inp * PRICE.input + r.outp * PRICE.output }));
  return { rows, total: rows.reduce((s, r) => s + r.cost, 0) };
}

// ---------- daily usage + goal ----------

/** Daily spend goal in USD (0 = none). */
export const dailyGoal = () => Number(kvGet("claude_daily_goal", 0)) || 0;
export const setDailyGoal = (usd) => kvSet("claude_daily_goal", Math.max(0, Number(usd) || 0));

/** Last `days` days (oldest first, ending today): [{date, calls, tokens, cost}], in the phone's local time. */
export function usageByDay(days = 7) {
  const start = dayStart(Date.now() - (days - 1) * 86400000 - 3600000 * 2); // pad for DST, trimmed below
  const out = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const date = localDate(Date.now() - i * 86400000);
    out.set(date, { date, calls: 0, tokens: 0, cost: 0 });
  }
  for (const r of all("SELECT input_tokens AS inp, output_tokens AS outp, created_at FROM llm_usage WHERE created_at >= ?", [start])) {
    const d = out.get(localDate(r.created_at));
    if (!d) continue;
    d.calls++;
    d.tokens += r.inp + r.outp;
    d.cost += r.inp * PRICE.input + r.outp * PRICE.output;
  }
  return [...out.values()];
}

/** One gentle toast per day, the first time today's spend passes the goal. */
function nudgeIfOverGoal() {
  const goal = dailyGoal();
  if (!goal) return;
  const today = localDate();
  if (kvGet("claude_goal_nudged") === today) return;
  const spent = usageByDay(1)[0].cost;
  if (spent < goal) return;
  kvSet("claude_goal_nudged", today);
  toast(`You've hit today's Claude goal ($${goal.toFixed(2)}) 🎯`, 5000);
}
