// Le feuilleton: a serial story at your level, one episode at a time.
// Only a short rolling summary + the end of the last episode is sent each time, so cost stays flat.
import { structured } from "./claude.js";
import { all, get, kvGet, run, tx } from "./db.js";
import { LENGTHS, LEVEL_GUIDE, learningLemmas, level } from "./content.js";

export const GENRES = {
  mystery: { emoji: "🕵️", fr: "Policier", en: "a light mystery (a disappearance, a strange neighbour, a stolen painting…)" },
  comedy: { emoji: "😄", fr: "Comédie", en: "a comedy of small misunderstandings and awkward situations" },
  romance: { emoji: "💌", fr: "Romance", en: "a gentle romance with ups and downs" },
  life: { emoji: "☕", fr: "Tranche de vie", en: "everyday life: work, flatmates, family, a new city" },
  adventure: { emoji: "🧭", fr: "Aventure", en: "an adventure: a trip, a treasure, an unexpected journey" },
};

const BASE_WORDS = { A1: 90, A2: 140, B1: 220, B2: 300, C1: 360 };
const episodeWords = (lv) => Math.round((BASE_WORDS[lv] * (LENGTHS[kvGet("text_length", "medium")] ?? 1)) / 10) * 10;

export const currentStory = () => get("SELECT * FROM story WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1");
export const episodes = (storyId) => all("SELECT id, title, episode, read_at, created_at FROM text WHERE story_id = ? ORDER BY episode", [storyId]);
export const nextUnreadEpisode = () =>
  get("SELECT text.id, text.title, text.episode FROM text JOIN story ON story.id = text.story_id WHERE story.ended_at IS NULL AND text.read_at IS NULL ORDER BY text.episode LIMIT 1");

const EPISODE_SCHEMA = {
  title: { type: "string", description: "Episode title in French (short)" },
  body: { type: "string", description: "The episode in French; paragraphs separated by blank lines; dialogue welcome" },
  summary: { type: "string", description: "One short, simple French sentence (at the learner's level) summarising what happened in this episode" },
};

const writerSystem = (lv) =>
  `You write a French serial story ("feuilleton") for an adult learner at CEFR ${lv}: ${LEVEL_GUIDE[lv]}.
Each episode is a satisfying scene that moves the plot forward, has some dialogue, and ends with a small hook or cliffhanger.
Keep characters consistent. Never explain vocabulary inside the story.`;

/** Create a story (characters, setting) and write episode 1. Returns the episode's text id. */
export async function startStory(genreKey, { claude = structured } = {}) {
  const lv = level();
  const key = genreKey === "surprise" ? Object.keys(GENRES)[Math.floor(Math.random() * 5)] : genreKey;
  const g = GENRES[key];
  const res = await claude({
    system: writerSystem(lv),
    user: `Invent a new feuilleton: ${g.en}. Set it somewhere in the French-speaking world.
Create 2-4 recurring characters, then write episode 1 (about ${episodeWords(lv)} words).
Use some of these words I'm learning if they fit naturally: ${learningLemmas().join(", ") || "(none)"}.`,
    schema: {
      type: "object",
      properties: {
        story_title: { type: "string", description: "Title of the whole series, in French" },
        setting: { type: "string", description: "Where/when, one sentence in English" },
        premise: { type: "string", description: "The overall premise, one or two sentences in English" },
        characters: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string", description: "One short English sentence" } } } },
        ...EPISODE_SCHEMA,
      },
    },
    purpose: "story",
    maxTokens: 4000,
  });
  return tx(() => {
    const bible = { setting: res.setting, premise: res.premise, characters: res.characters };
    const storyId = run("INSERT INTO story(title, genre, bible, summary, level, created_at) VALUES (?,?,?,?,?,?)", [
      res.story_title, key, JSON.stringify(bible), `1. ${res.summary}`, lv, Date.now(),
    ]);
    return addEpisode(storyId, 1, res.title, res.body);
  });
}

function addEpisode(storyId, n, title, body) {
  return run("INSERT INTO text(source, title, body, created_at, story_id, episode) VALUES ('story',?,?,?,?,?)", [
    title.trim() || `Épisode ${n}`, body.trim().replace(/\r\n/g, "\n"), Date.now(), storyId, n,
  ]);
}

/** Write the next episode of a story. Returns its text id. */
export async function nextEpisode(storyId, { claude = structured } = {}) {
  const story = get("SELECT * FROM story WHERE id = ?", [storyId]);
  const bible = JSON.parse(story.bible);
  const last = get("SELECT body, episode FROM text WHERE story_id = ? ORDER BY episode DESC LIMIT 1", [storyId]);
  const lv = level();
  const n = (last?.episode || 0) + 1;
  const tail = (last?.body || "").split(/\n\s*\n/).slice(-2).join("\n\n");
  const recap = story.summary.split("\n").slice(-12).join("\n"); // older episodes are already folded into the premise
  const res = await claude({
    system: writerSystem(lv),
    user: `Series: "${story.title}". Setting: ${bible.setting}. Premise: ${bible.premise}
Characters: ${bible.characters.map((c) => `${c.name}: ${c.description}`).join(" | ")}
Story so far (one line per episode):
${recap}
End of the previous episode:
<<<
${tail}
>>>
Write episode ${n} (about ${episodeWords(lv)} words), continuing directly. Use some of these words I'm learning if they fit: ${learningLemmas().join(", ") || "(none)"}.`,
    schema: { type: "object", properties: EPISODE_SCHEMA },
    purpose: "story",
    maxTokens: 4000,
  });
  return tx(() => {
    run("UPDATE story SET summary = ? WHERE id = ?", [`${story.summary}\n${n}. ${res.summary}`.trim(), storyId]);
    return addEpisode(storyId, n, res.title, res.body);
  });
}

export const endStory = (storyId) => run("UPDATE story SET ended_at = ? WHERE id = ?", [Date.now(), storyId]);
export const storyOf = (textId) => get("SELECT story.* FROM story JOIN text ON text.story_id = story.id WHERE text.id = ?", [textId]);
