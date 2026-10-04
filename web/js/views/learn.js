import { all, kvGet, kvSet, scalar } from "../db.js";
import { explainSentence, level, saveSentence, saveWord } from "../content.js";
import { hasKey } from "../claude.js";
import { translate } from "../translate.js";
import {
  TENSES, canSpeak, checkConj, forms, knownCount, learnWord, loadVerbs, markKnown, newWords, promptText,
  question, saveConjMistake, speak, subjectFor, verbByInf, verbLabel, IMPERATIVE_LABELS,
} from "../learn.js";
import { GROUPS, LESSONS, lessonById } from "../lessons.js";
import { lemmaCandidates, loadDict, lookup } from "../nlp.js";
import { queue, settings } from "../srs.js";
import { busy, fmtDay, go, html, mark, raw, toast } from "../util.js";
export { speak };

const sayBtn = (text) => (canSpeak() ? html`<button class="say" data-say="${text}" aria-label="Pronounce">🔊</button>` : "");
/** First two senses, without long parentheticals: "to do; to make". */
const short = (gloss = "") => gloss.split(/;\s*/).slice(0, 2).map((g) => g.replace(/\s*\([^)]{18,}\)/g, "")).join("; ");

const article = (lemma, gender) =>
  !gender ? "" : /^[aeiouhâàéèêîôœ]/i.test(lemma) ? "l'" : gender === "m" ? "le " : "la ";

// ---------- hub ----------

export async function learnHub(root) {
  const due = queue(settings().reviewCap).length;
  const learned = scalar("SELECT COUNT(*) FROM item WHERE kind = 'word'");
  const conjCards = scalar("SELECT COUNT(*) FROM item WHERE kind = 'conj'");
  root.innerHTML = html`
    <h1>Apprendre</h1>
    <a href="#/review" class="card hub c-purple"><span class="hub-icon">↻</span>
      <span class="grow"><strong>Review</strong><small>${due ? `${due} cards due` : "nothing due right now"}</small></span><span class="chev">→</span></a>
    <a href="#/learn/add" class="card hub c-purple"><span class="hub-icon">＋</span>
      <span class="grow"><strong>Add your own</strong><small>Type a French word or sentence, see what it means, save it to review</small></span><span class="chev">→</span></a>
    <a href="#/listen" class="card hub c-sage"><span class="hub-icon">🎧</span>
      <span class="grow"><strong>Listening</strong><small>Dictation with native speakers (Tatoeba)</small></span><span class="chev">→</span></a>
    <a href="#/learn/words" class="card hub c-coral"><span class="hub-icon">✚</span>
      <span class="grow"><strong>New words</strong><small>Common ${level()} words and verbs you haven't learned yet · ${learned} saved, ${knownCount()} already known</small></span><span class="chev">→</span></a>
    <a href="#/learn/verbs" class="card hub c-sky"><span class="hub-icon">⇄</span>
      <span class="grow"><strong>Conjugation</strong><small>Drill verbs tense by tense${conjCards ? ` · ${conjCards} to review` : ""}</small></span><span class="chev">→</span></a>
    <a href="#/learn/tips" class="card hub c-mustard"><span class="hub-icon">✦</span>
      <span class="grow"><strong>Tips &amp; tricks</strong><small>${LESSONS.length} short lessons: verbs, grammar, common mistakes, pronunciation</small></span><span class="chev">→</span></a>`;
}

// ---------- new words ----------

export async function wordsView(root, { query }) {
  const verbsOnly = query.get("verbs") === "1";
  root.innerHTML = html`<h1>Nouveaux mots</h1><p class="loading">Loading dictionary</p>`;
  const [dict] = await Promise.all([loadDict(), loadVerbs()]);
  const lv = level();
  const list = newWords(dict, lv, { verbsOnly, limit: 12 });
  root.innerHTML = html`
    <h1>Nouveaux mots</h1>
    <div class="segmented">
      <button class="${verbsOnly ? "" : "on"}" data-href="#/learn/words">All words</button>
      <button class="${verbsOnly ? "on" : ""}" data-href="#/learn/words?verbs=1">Verbs</button>
    </div>
    <p class="muted small">The most common ${lv} ${verbsOnly ? "verbs" : "words"} you haven't saved yet. <b>Learn</b> adds it to your reviews; <b>I know it</b> hides it for good.</p>
    ${list.length ? "" : html`<div class="card">You've been through every ${lv} ${verbsOnly ? "verb" : "word"} in the dictionary. Try the next level in Settings!</div>`}
    <ul class="list">${list.map((w, i) => {
      const [pos, gender, gloss, exFr, exEn] = w.senses[0];
      const isVerb = w.senses.some(([p]) => p === "verb");
      return html`
        <li class="card word-card" data-i="${i}">
          <div class="row between gap">
            <div class="grow">
              <p class="big">${article(w.lemma, gender)}${w.lemma} ${sayBtn(w.lemma)}</p>
              <p class="small muted">${w.senses.map(([p]) => p).filter((p, j, a) => a.indexOf(p) === j).join(", ")}</p>
            </div>
          </div>
          <p>${short(gloss)}</p>
          ${w.senses[1] ? html`<p class="small muted">also: ${short(w.senses[1][2])}</p>` : ""}
          ${exFr ? html`<p class="ex" >${exFr} ${sayBtn(exFr)}<span>${exEn}</span></p>` : ""}
          <div class="row gap">
            <button class="grow" data-act="learn">Learn</button>
            <button class="secondary" data-act="known">I know it</button>
            ${isVerb && verbByInf(w.lemma) ? html`<a class="button secondary" href="#/learn/verb/${encodeURIComponent(w.lemma)}">Table</a>` : ""}
          </div>
        </li>`;
    })}</ul>
    ${list.length ? html`<button class="secondary wide" id="more">Show more</button>` : ""}`;

  root.querySelector(".segmented").onclick = (e) => e.target.dataset.href && go(e.target.dataset.href);
  root.querySelector("#more")?.addEventListener("click", () => go(location.hash));
  root.querySelector(".list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const li = b.closest("li");
    const w = list[Number(li.dataset.i)];
    if (b.dataset.act === "learn") {
      learnWord(w);
      toast(`“${w.lemma}” added to your reviews`);
    } else {
      markKnown(w.lemma);
    }
    li.classList.add("gone");
    setTimeout(() => li.remove(), 250);
  });
}

// ---------- conjugation trainer ----------

const VERB_SETS = { 20: "Top 20", 50: "Top 50", 100: "Top 100", all: "All" };

export async function verbsView(root, { query }) {
  root.innerHTML = html`<h1>Conjugaison</h1><p class="loading">Loading verbs</p>`;
  const verbs = await loadVerbs();
  let tenses = kvGet("conj_tenses", ["present"]);
  if (query.get("tenses")) {
    tenses = query.get("tenses").split(",").filter((t) => TENSES[t]);
    kvSet("conj_tenses", tenses);
  }
  const setKey = kvGet("conj_set", "20");
  const only = query.get("verbs")?.split(",");
  const pool = only ? verbs.filter((v) => only.includes(v.inf))
    : query.get("reflexive") ? verbs.filter((v) => v.reflexive)
    : setKey === "all" ? verbs : verbs.slice(0, Number(setKey));
  const q = question(pool, tenses);
  let streakRun = kvGet("conj_run", 0);

  root.innerHTML = html`
    <header class="row between">
      <h1>Conjugaison</h1>
      <span class="pill">🔥 ${streakRun} in a row</span>
    </header>
    <div class="chips" id="tenses">${Object.entries(TENSES).map(([k, label]) =>
      html`<button class="chip ${tenses.includes(k) ? "on" : ""}" data-t="${k}">${label}</button>`)}</div>
    <div class="row gap small">
      ${only || query.get("reflexive") ? html`<span class="muted">Practising: ${pool.map(verbLabel).slice(0, 6).join(", ")}${pool.length > 6 ? "…" : ""} · <a href="#/learn/verbs">all verbs</a></span>`
        : html`<span class="muted">Verbs:</span><div class="chips">${Object.entries(VERB_SETS).map(([k, label]) =>
          html`<button class="chip ${setKey === k ? "on" : ""}" data-set="${k}">${label}</button>`)}</div>`}
    </div>
    ${q ? html`
      <div class="card conj-card">
        <p class="kind">${TENSES[q.tense]}</p>
        <p class="big">${verbLabel(q.verb)} ${sayBtn(verbLabel(q.verb))}</p>
        <p class="muted small">${short(q.verb.gloss)}</p>
        <div class="conj-line">
          <span class="subj">${q.tense === "imperatif" ? IMPERATIVE_LABELS[q.person] : subjectFor(q.verb, q.tense, q.person, q.answer)}</span>
          <input id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…">
        </div>
        <div class="row gap" id="actions">
          <button class="grow" id="check">Check</button>
          <button class="secondary" id="show">Show</button>
        </div>
        <div id="result"></div>
      </div>
      <a class="small" href="#/learn/verb/${encodeURIComponent(q.verb.inf)}">See the full table for ${verbLabel(q.verb)} →</a>`
      : html`<div class="card">Pick at least one tense.</div>`}`;

  // Keep the verb filter (?verbs= / ?reflexive=) but let the saved tenses take over.
  const base = () => {
    const keep = new URLSearchParams(query);
    keep.delete("tenses");
    return `#/learn/verbs${keep.toString() ? `?${keep}` : ""}`;
  };
  root.querySelector("#tenses").onclick = (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    const next = tenses.includes(t) ? tenses.filter((x) => x !== t) : [...tenses, t];
    kvSet("conj_tenses", next.length ? next : [t]);
    go(base());
  };
  root.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => { kvSet("conj_set", b.dataset.set); go(base()); }));
  if (!q) return;

  const input = root.querySelector("#answer");
  input.focus();
  const finish = (status) => {
    root.querySelector("#actions").hidden = true;
    input.readOnly = true;
    const full = `${subjectFor(q.verb, q.tense, q.person, q.answer)}${q.answer}`.trim();
    if (status !== "ok") {
      saveConjMistake(q);
      streakRun = 0;
    } else streakRun++;
    kvSet("conj_run", streakRun);
    input.classList.add(status === "ok" ? "right" : status === "accent" ? "almost" : "wrong");
    root.querySelector("#result").innerHTML = html`
      <div class="dictation">
        <p class="score ${status === "ok" ? "good" : status === "accent" ? "" : "low"}">${status === "ok" ? "Juste !" : status === "accent" ? "Almost: check the accents" : "Pas tout à fait"}</p>
        <p class="context">${full} ${sayBtn(full)}</p>
        ${status !== "ok" ? html`<p class="small muted">Added to your reviews.</p>` : ""}
        <button class="wide" id="next">Next →</button>
      </div>`;
    root.querySelector("#next").onclick = () => go(base());
    root.querySelector("#next").focus();
  };
  root.querySelector("#check").onclick = () => input.value.trim() && finish(checkConj(q, input.value));
  root.querySelector("#show").onclick = () => finish("wrong");
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      root.querySelector("#check").click();
    }
  };
}

export async function verbTable(root, { params: [inf] }) {
  await loadVerbs();
  const v = verbByInf(decodeURIComponent(inf));
  if (!v) return go("#/learn/verbs");
  root.innerHTML = html`
    <h1>${verbLabel(v)}</h1>
    <p class="muted">${short(v.gloss)}</p>
    <p class="small">Past participle: <b>${v.pp}</b> · auxiliary: <b>${v.reflexive ? "être (reflexive)" : v.aux.join(" or ")}</b></p>
    <a class="button wide" href="#/learn/verbs?verbs=${encodeURIComponent(v.inf)}&tenses=present,passe_compose,imparfait,futur">Practise ${verbLabel(v)}</a>
    ${Object.entries(TENSES).map(([t, label]) => {
      const f = forms(v, t);
      if (!f || !f.some(Boolean)) return "";
      return html`
        <h2>${label}</h2>
        <div class="card conj-table">${f.map((x, i) => x == null ? "" : html`
          <div class="row between"><span><span class="muted">${t === "imperatif" ? IMPERATIVE_LABELS[i] + " " : subjectFor(v, t, i, x)}</span>${x}</span>
          ${sayBtn(`${t === "imperatif" ? "" : subjectFor(v, t, i, x)}${x}`.replace(/\(e\)s?$/, ""))}</div>`)}</div>`;
    })}`;
}

// ---------- tips ----------

export function tipsView(root) {
  root.innerHTML = html`
    <h1>Astuces</h1>
    ${GROUPS.map((g) => html`
      <h2>${g}</h2>
      <ul class="list">${LESSONS.filter((l) => l.group === g).map((l) => html`
        <li><a href="#/learn/tips/${l.id}" class="card row between gap">
          <span class="grow"><strong>${l.title}</strong></span><span class="pill">${l.level}</span>
        </a></li>`)}</ul>`)}`;
}

export function lessonView(root, { params: [id] }) {
  const l = lessonById(id);
  if (!l) return go("#/learn/tips");
  const practiceHref = l.practice
    ? `#/learn/verbs?tenses=${l.practice.join(",")}${l.verbs ? `&verbs=${l.verbs.map(encodeURIComponent).join(",")}` : ""}${l.reflexiveOnly ? "&reflexive=1" : ""}`
    : null;
  const idx = LESSONS.indexOf(l);
  const next = LESSONS[idx + 1];
  root.innerHTML = html`
    <p class="kind">${l.group} · ${l.level}</p>
    <h1>${l.title}</h1>
    <article class="lesson">${raw(l.body)}</article>
    ${practiceHref ? html`<a class="button wide" href="${practiceHref}">Practise this →</a>` : ""}
    ${next ? html`<a class="card row between" href="#/learn/tips/${next.id}"><span><small class="muted">Next</small>${next.title}</span><span class="chev">→</span></a>` : ""}`;
  // 🔊 on every example line
  if (canSpeak()) {
    root.querySelectorAll(".lesson .ex").forEach((p) => {
      const b = document.createElement("button");
      b.className = "say";
      b.dataset.say = p.dataset.say;
      b.textContent = "🔊";
      b.setAttribute("aria-label", "Pronounce");
      p.prepend(b);
    });
  }
}

// ---------- add your own words & sentences ----------

export async function addView(root) {
  const recent = all(`SELECT id, kind, front, back, created_at FROM item WHERE kind IN ('word','sentence') AND text_id IS NULL
                      ORDER BY created_at DESC LIMIT 10`);
  root.innerHTML = html`
    <h1>Ajouter</h1>
    <p class="muted small">Type a French word or sentence you've come across. You'll see what it means, then you can save it to your reviews.</p>
    <div class="card stack">
      <textarea id="fr" rows="2" placeholder="ex. : avoir le cafard / Je n'en reviens pas !" autocapitalize="off" spellcheck="false"></textarea>
      <button id="go" class="wide">Translate</button>
      <div id="result"></div>
    </div>
    ${recent.length ? html`
      <h2>Recently added</h2>
      <ul class="list">${recent.map((r) => html`
        <li class="card"><strong>${r.kind === "word" ? r.front : mark(r.front)}</strong><br><span class="muted">${r.back}</span>
          <small class="muted">${r.kind} · ${fmtDay(r.created_at)}</small></li>`)}</ul>` : ""}`;

  const input = root.querySelector("#fr");
  const out = root.querySelector("#result");
  input.focus();
  const run = async () => {
    const text = input.value.trim().replace(/\s+/g, " ");
    if (!text) return input.focus();
    const isWord = text.split(" ").length <= 2 && !/[.!?]$/.test(text);
    out.innerHTML = html`<p class="loading small">Translating</p>`;
    let en = "";
    try { en = await translate(text); } catch (e) { toast(e.message, 4000); }

    if (isWord) {
      await loadDict().catch(() => {});
      const entries = lookup(text).slice(0, 3);
      const first = entries[0];
      out.innerHTML = html`
        <p class="big">${text} <button class="say" data-say="${text}">🔊</button></p>
        <label class="small muted">Meaning to learn<input id="meaning" value="${en || (first ? first.gloss.split(/;\s*/).slice(0, 2).join("; ") : "")}"></label>
        ${entries.length ? html`<p class="small muted">Dictionary (tap one to use it):</p>
          <ul class="dict pick">${entries.map((d) => html`
          <li data-gloss="${d.gloss}"><span class="grow"><strong>${d.lemma}</strong> <small class="muted inline">${d.pos}${d.gender ? ` · ${d.gender}` : ""}</small> — ${d.gloss}</span></li>`)}</ul>` : ""}
        <button class="wide" id="save">Save to review</button>`;
      out.querySelector(".dict.pick")?.addEventListener("click", (e) => {
        const li = e.target.closest("[data-gloss]");
        if (li) out.querySelector("#meaning").value = li.dataset.gloss;
      });
      out.querySelector("#save").onclick = (e) => {
        const meaning = out.querySelector("#meaning").value.trim();
        if (!meaning) return toast("Add a meaning first");
        const lemma = first?.lemma || lemmaCandidates(text)[0] || text.toLowerCase();
        const res = saveWord({
          word: text, sentence: first?.ex_fr || "", textId: null,
          g: { lemma, pos: first?.pos || "", gender: first?.gender || "", lemma_meaning: meaning, sentence_en: first?.ex_en || null },
        });
        e.target.disabled = true;
        e.target.textContent = res.created ? "Saved ✓" : "Already saved ✓";
      };
    } else {
      out.innerHTML = html`
        <p class="context">${text} <button class="say" data-say="${text}">🔊</button></p>
        <label class="small muted">Translation<textarea id="meaning" rows="2">${en}</textarea></label>
        <div id="notes"></div>
        <div class="row gap">
          <button class="grow" id="save">Save to review</button>
          ${hasKey() ? html`<button class="secondary" id="explain">✦ Explain grammar</button>` : ""}
        </div>`;
      let notes = null;
      out.querySelector("#explain")?.addEventListener("click", (e) => busy(e.target, "…", async () => {
        const r = await explainSentence(text);
        notes = r.notes;
        if (!out.querySelector("#meaning").value.trim()) out.querySelector("#meaning").value = r.translation;
        out.querySelector("#notes").innerHTML = html`<p class="small muted">Claude: ${r.translation}</p><ul class="notes">${r.notes.map((n) => html`<li>${n}</li>`)}</ul>`;
        e.target.remove();
      }));
      out.querySelector("#save").onclick = (e) => {
        const translation = out.querySelector("#meaning").value.trim();
        if (!translation) return toast("Add a translation first");
        const res = saveSentence({ sentence: text, translation, notes: notes?.join(" · "), textId: null });
        e.target.disabled = true;
        e.target.textContent = res.created ? "Saved ✓" : "Already saved ✓";
      };
    }
  };
  root.querySelector("#go").onclick = (e) => busy(e.target, "Translating…", run);
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      root.querySelector("#go").click();
    }
  };
}
