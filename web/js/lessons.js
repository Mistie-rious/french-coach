// Short lessons: rules, tricks and the classic mistakes English speakers make.
// Bodies are trusted HTML written here. <p class="ex" data-say="…"> lines get a 🔊 button.
// `practice` links a lesson to the conjugation trainer.

const ex = (fr, en) => `<p class="ex" data-say="${fr.replace(/<[^>]+>/g, "").replace(/"/g, "&quot;")}">${fr}<span>${en}</span></p>`;

export const GROUPS = ["Verbs", "Grammar", "Common mistakes", "Pronunciation"];

export const LESSONS = [
  // ───────── Verbs ─────────
  {
    id: "present", group: "Verbs", level: "A1", title: "The present tense: three families",
    practice: ["present"],
    body: `
<p>Take the infinitive, drop the ending, add the new ending. Most verbs (about 90%) end in <b>-er</b>, and they're all regular except <i>aller</i>.</p>
<table class="mini"><tr><th></th><th>-er (parler)</th><th>-ir (finir)</th><th>-re (vendre)</th></tr>
<tr><td>je</td><td>parl<b>e</b></td><td>fin<b>is</b></td><td>vend<b>s</b></td></tr>
<tr><td>tu</td><td>parl<b>es</b></td><td>fin<b>is</b></td><td>vend<b>s</b></td></tr>
<tr><td>il/elle</td><td>parl<b>e</b></td><td>fin<b>it</b></td><td>vend</td></tr>
<tr><td>nous</td><td>parl<b>ons</b></td><td>fin<b>issons</b></td><td>vend<b>ons</b></td></tr>
<tr><td>vous</td><td>parl<b>ez</b></td><td>fin<b>issez</b></td><td>vend<b>ez</b></td></tr>
<tr><td>ils/elles</td><td>parl<b>ent</b></td><td>fin<b>issent</b></td><td>vend<b>ent</b></td></tr></table>
<h3>Tricks</h3>
<ul>
<li><b>-er verbs sound the same</b> for je, tu, il and ils: <i>parle, parles, parle, parlent</i> are all pronounced "parl". The -ent is silent!</li>
<li><b>nous → -ons, vous → -ez</b> for almost every verb, even irregular ones. Exceptions: <i>nous sommes, vous êtes, vous faites, vous dites</i>.</li>
<li>Spelling tweaks: <i>manger → nous mang<b>e</b>ons</i>, <i>commencer → nous commen<b>ç</b>ons</i> (to keep the soft sound); <i>acheter → j'ach<b>è</b>te</i>, <i>appeler → j'appe<b>ll</b>e</i>.</li>
</ul>
${ex("Je parle français et nous finissons à six heures.", "I speak French and we finish at six.")}
${ex("Ils attendent le bus.", "They are waiting for the bus. (one tense in French for both 'wait' and 'are waiting')")}`,
  },
  {
    id: "big4", group: "Verbs", level: "A1", title: "The four verbs you need most",
    practice: ["present"], verbs: ["être", "avoir", "aller", "faire"],
    body: `
<p><b>être</b> (to be), <b>avoir</b> (to have), <b>aller</b> (to go) and <b>faire</b> (to do/make) are irregular and everywhere. Learn them by heart, out loud.</p>
<table class="mini"><tr><th></th><th>être</th><th>avoir</th><th>aller</th><th>faire</th></tr>
<tr><td>je/j'</td><td>suis</td><td>ai</td><td>vais</td><td>fais</td></tr>
<tr><td>tu</td><td>es</td><td>as</td><td>vas</td><td>fais</td></tr>
<tr><td>il/elle</td><td>est</td><td>a</td><td>va</td><td>fait</td></tr>
<tr><td>nous</td><td>sommes</td><td>avons</td><td>allons</td><td>faisons</td></tr>
<tr><td>vous</td><td>êtes</td><td>avez</td><td>allez</td><td>faites</td></tr>
<tr><td>ils/elles</td><td>sont</td><td>ont</td><td>vont</td><td>font</td></tr></table>
<h3>Tricks</h3>
<ul>
<li>Spot the pattern in the <b>ils</b> forms: so<b>nt</b>, o<b>nt</b>, vo<b>nt</b>, fo<b>nt</b>. These four are the only common verbs ending in <b>-ont</b>.</li>
<li><b>faire</b> covers a lot: <i>faire du sport</i> (play sport), <i>faire la cuisine</i> (cook), <i>il fait beau</i> (the weather's nice).</li>
<li>Don't confuse <i>il <b>a</b></i> (he has) with the preposition <i><b>à</b></i> (to/at).</li>
</ul>
${ex("Nous sommes fatigués, mais ils ont faim.", "We're tired, but they're hungry.")}
${ex("Qu'est-ce que vous faites ce soir ?", "What are you doing tonight?")}`,
  },
  {
    id: "passe-compose", group: "Verbs", level: "A2", title: "Passé composé: avoir or être?",
    practice: ["passe_compose"],
    body: `
<p>Passé composé = <b>present of avoir or être + past participle</b>. It's for completed actions: "I ate", "I have eaten".</p>
<p><b>Past participles:</b> -er → <b>é</b> (parlé), -ir → <b>i</b> (fini), -re → <b>u</b> (vendu). Common irregulars: <i>été, eu, fait, dit, pris, mis, vu, voulu, pu, su, dû, lu, écrit, bu, venu, né, mort, ouvert</i>.</p>
<h3>Most verbs use avoir</h3>
${ex("J'ai mangé une pomme.", "I ate an apple.")}
<h3>A short list uses être: "the house of être"</h3>
<p>Mostly verbs of movement or change of state. Remember them as <b>DR &amp; MRS VANDERTRAMP</b>:</p>
<p class="small">Devenir, Revenir · Monter, Rester, Sortir · Venir, Aller, Naître, Descendre, Entrer, Rentrer, Tomber, Retourner, Arriver, Mourir, Partir. <b>Plus every reflexive verb</b> (<i>je me suis levé</i>).</p>
<h3>Agreement with être</h3>
<p>With être, the participle agrees with the subject like an adjective: <i>elle est allé<b>e</b></i>, <i>ils sont parti<b>s</b></i>, <i>elles sont arrivé<b>es</b></i>.</p>
${ex("Elle est arrivée hier et ils sont partis ce matin.", "She arrived yesterday and they left this morning.")}
<h3>Classic mistakes</h3>
<ul><li>❌ <i>J'ai allé</i> → ✅ <i>Je suis allé(e)</i></li>
<li>❌ <i>Je suis mangé</i> (that means "I've been eaten"!) → ✅ <i>J'ai mangé</i></li></ul>`,
  },
  {
    id: "imparfait", group: "Verbs", level: "A2", title: "Imparfait vs passé composé",
    practice: ["imparfait", "passe_compose"],
    body: `
<p><b>Forming the imparfait:</b> take the <i>nous</i> form of the present, drop <i>-ons</i>, add <b>-ais, -ais, -ait, -ions, -iez, -aient</b>.<br>
nous <i>finiss</i>ons → je finiss<b>ais</b>. The only exception is <b>être → ét-</b> (j'étais).</p>
<h3>Which one?</h3>
<table class="mini"><tr><th>Imparfait = the background</th><th>Passé composé = the event</th></tr>
<tr><td>descriptions, feelings, weather</td><td>one finished action</td></tr>
<tr><td>habits ("used to")</td><td>a sequence: then… then…</td></tr>
<tr><td>what was going on</td><td>what happened / interrupted</td></tr></table>
<p><b>Trick:</b> imagine a film. The imparfait is the scenery, the passé composé is the action.</p>
${ex("Il pleuvait quand je suis sorti.", "It was raining when I went out.")}
${ex("Quand j'étais petit, je jouais au foot tous les jours.", "When I was little, I used to play football every day.")}
${ex("Hier, je me suis levé, j'ai pris un café et je suis parti.", "Yesterday I got up, had a coffee and left.")}
<p><b>Signal words:</b> <i>tous les jours, souvent, d'habitude</i> → imparfait · <i>hier, soudain, une fois, tout à coup</i> → passé composé.</p>`,
  },
  {
    id: "future", group: "Verbs", level: "A2", title: "Talking about the future",
    practice: ["futur"],
    body: `
<h3>Futur proche: aller + infinitive (easy, very common)</h3>
${ex("Je vais manger. On va voir.", "I'm going to eat. We'll see.")}
<h3>Futur simple: infinitive + ending</h3>
<p>Endings: <b>-ai, -as, -a, -ons, -ez, -ont</b>. Trick: they look like the present of <i>avoir</i> (ai, as, a, (av)ons, (av)ez, ont). For -re verbs, drop the final <i>e</i>: <i>prendre → je prendr<b>ai</b></i>.</p>
<p><b>Irregular stems</b> (same endings): être → <b>ser-</b>, avoir → <b>aur-</b>, aller → <b>ir-</b>, faire → <b>fer-</b>, pouvoir → <b>pourr-</b>, vouloir → <b>voudr-</b>, venir → <b>viendr-</b>, voir → <b>verr-</b>, savoir → <b>saur-</b>, devoir → <b>devr-</b>.</p>
${ex("Demain, il fera beau et nous irons à la plage.", "Tomorrow the weather will be nice and we'll go to the beach.")}
<p><b>Trick:</b> after <i>quand</i> about the future, French uses the future too: <i>Quand je <b>serai</b> à Paris, je t'appellerai</i> (English says "when I <i>am</i>").</p>`,
  },
  {
    id: "conditionnel", group: "Verbs", level: "B1", title: "The conditional: would, could, should",
    practice: ["conditionnel"],
    body: `
<p><b>Form:</b> the future stem + the imparfait endings: <i>je parler<b>ais</b>, je ser<b>ais</b>, je pourr<b>ais</b>, je voudr<b>ais</b></i>.</p>
<h3>Uses</h3>
<ul><li><b>Politeness:</b> <i>Je voudrais un café. Pourriez-vous m'aider ?</i></li>
<li><b>Advice:</b> <i>Tu devrais dormir.</i> (You should sleep.)</li>
<li><b>Hypotheses:</b> <i>si</i> + imparfait, conditionnel.</li></ul>
${ex("Si j'avais le temps, je voyagerais plus.", "If I had the time, I would travel more.")}
<p><b>Classic mistake:</b> never put the conditional right after <i>si</i>. ❌ <i>Si j'aurais</i> → ✅ <i>Si j'avais</i>.</p>`,
  },
  {
    id: "subjonctif", group: "Verbs", level: "B1", title: "The subjunctive: when and how",
    practice: ["subjonctif"],
    body: `
<p><b>Form:</b> take the <i>ils</i> present form, drop <i>-ent</i>, add <b>-e, -es, -e, -ions, -iez, -ent</b>: ils finiss<i>ent</i> → que je finiss<b>e</b>.</p>
<p><b>Irregular:</b> être → <i>sois</i>, avoir → <i>aie</i>, aller → <i>aille</i>, faire → <i>fasse</i>, pouvoir → <i>puisse</i>, savoir → <i>sache</i>, vouloir → <i>veuille</i>.</p>
<h3>When? After "que" + wanting, feeling, necessity, doubt</h3>
<ul><li><i>il faut que…, je veux que…, j'aimerais que…</i></li>
<li><i>je suis content que…, j'ai peur que…</i></li>
<li><i>bien que…, pour que…, avant que…</i></li></ul>
${ex("Il faut que tu viennes demain.", "You have to come tomorrow.")}
${ex("Je veux que vous soyez heureux.", "I want you to be happy.")}
<p><b>Trick:</b> <i>je pense que</i> takes the normal indicative (<i>je pense qu'il <b>est</b> là</i>), but <i>je ne pense pas que</i> takes the subjunctive (<i>…qu'il <b>soit</b> là</i>). Also: same subject means use the infinitive. <i>Je veux partir</i>, not <i>je veux que je parte</i>.</p>`,
  },
  {
    id: "reflexive", group: "Verbs", level: "A2", title: "Reflexive verbs: se lever, s'appeler…",
    practice: ["present", "passe_compose"], reflexiveOnly: true,
    body: `
<p>Many daily-routine verbs come with a pronoun that matches the subject: <b>me, te, se, nous, vous, se</b> (m', t', s' before a vowel).</p>
${ex("Je me lève à sept heures, je me douche et je m'habille.", "I get up at seven, shower and get dressed.")}
<ul><li><b>Negative:</b> the pronoun stays glued to the verb: <i>Je <b>ne</b> me lève <b>pas</b>.</i></li>
<li><b>Passé composé:</b> always <b>être</b>: <i>Elle s'est réveillée tard.</i></li>
<li><b>Imperative:</b> <i>Lève-toi ! Dépêchons-nous ! Asseyez-vous.</i></li>
<li><b>Infinitive:</b> the pronoun still matches: <i>Je vais <b>me</b> coucher.</i></li></ul>
<p><b>Common ones:</b> s'appeler, se lever, se coucher, se réveiller, s'habiller, se dépêcher, se souvenir de, s'amuser, s'ennuyer, se tromper.</p>`,
  },

  // ───────── Grammar ─────────
  {
    id: "gender", group: "Grammar", level: "A1", title: "Guessing a noun's gender",
    body: `
<p>Always learn nouns <b>with their article</b> (<i>la table</i>, not just <i>table</i>). The endings below give you a good guess, often 80–90% reliable.</p>
<table class="mini"><tr><th>Usually masculine ♂</th><th>Usually feminine ♀</th></tr>
<tr><td>-age (le fromage)</td><td>-tion, -sion (la nation)</td></tr>
<tr><td>-ment (le moment)</td><td>-té (la liberté)</td></tr>
<tr><td>-eau (le bureau)</td><td>-ette (la baguette)</td></tr>
<tr><td>-isme (le tourisme)</td><td>-ure (la voiture)</td></tr>
<tr><td>-ier (le cahier)</td><td>-ance, -ence (la chance)</td></tr>
<tr><td>-oir (le soir)</td><td>-ie (la vie)</td></tr></table>
<p><b>Famous exceptions:</b> <i>la plage, la page, l'image (f), la cage, l'eau (f), la peau</i>; <i>le lycée, le musée</i>.</p>
<p><b>Trick:</b> most nouns ending in <b>-e</b> are feminine, and most ending in a consonant are masculine. It's a rough rule, but better than guessing.</p>`,
  },
  {
    id: "articles", group: "Grammar", level: "A1", title: "le, un, du: which article?",
    body: `
<ul><li><b>le / la / les</b>: a specific thing, or things <i>in general</i> (especially after aimer, adorer, détester).</li>
<li><b>un / une / des</b>: one thing / some countable things.</li>
<li><b>du / de la / de l'</b>: <i>some</i> of something uncountable (food, drinks, abstract things).</li></ul>
${ex("J'aime le café. Je bois du café le matin.", "I like coffee. I drink coffee in the morning.")}
<h3>The two traps</h3>
<ul><li>After a <b>negative</b>, un/une/des/du/de la all become <b>de</b>: <i>Je n'ai pas <b>de</b> voiture. Il ne boit pas <b>de</b> lait.</i> (but not after être: <i>Ce n'est pas un problème</i>)</li>
<li>After <b>quantities</b>: <i>beaucoup <b>de</b> gens, un peu <b>de</b> sucre, un kilo <b>de</b> pommes</i>.</li></ul>
<p><b>Contractions:</b> à + le = <b>au</b>, à + les = <b>aux</b>, de + le = <b>du</b>, de + les = <b>des</b>.</p>`,
  },
  {
    id: "negation", group: "Grammar", level: "A1", title: "Saying no: ne … pas and friends",
    body: `
<p><b>ne</b> goes before the verb, <b>pas</b> after it. In compound tenses, it wraps around the <i>auxiliary</i>.</p>
${ex("Je ne mange pas. Je n'ai pas mangé.", "I'm not eating. I didn't eat.")}
<table class="mini"><tr><td>ne … jamais</td><td>never</td></tr><tr><td>ne … plus</td><td>no longer / no more</td></tr>
<tr><td>ne … rien</td><td>nothing</td></tr><tr><td>ne … personne</td><td>nobody</td></tr><tr><td>ne … que</td><td>only</td></tr></table>
${ex("Il ne travaille plus ici. Je n'ai rien vu.", "He doesn't work here any more. I didn't see anything.")}
<p><b>Spoken French</b> often drops the <i>ne</i>: <i>J'sais pas, c'est pas grave</i>. That's fine in speech, but keep it in writing.</p>`,
  },
  {
    id: "questions", group: "Grammar", level: "A1", title: "Three ways to ask a question",
    body: `
<ol><li><b>Intonation</b> (casual): <i>Tu viens ?</i></li>
<li><b>Est-ce que</b> (neutral, always works): <i>Est-ce que tu viens ?</i></li>
<li><b>Inversion</b> (formal/written): <i>Viens-tu ?</i> With il/elle and a vowel, add <b>-t-</b>: <i>Parle-<b>t</b>-il anglais ?</i></li></ol>
<p><b>Question words:</b> où (where), quand (when), comment (how), pourquoi (why), combien (how much), qui (who), que/quoi (what), quel/quelle (which).</p>
${ex("Où est-ce que tu habites ? Qu'est-ce que tu fais ?", "Where do you live? What are you doing?")}
<p><b>Classic mistake:</b> "What is it?" is <i>Qu'est-ce que c'est ?</i>, not <i>Quoi est-ce ?</i></p>`,
  },
  {
    id: "places", group: "Grammar", level: "A2", title: "à, en, au: talking about places",
    body: `
<table class="mini"><tr><td><b>à</b> + city</td><td>à Paris, à Lagos, à Londres</td></tr>
<tr><td><b>en</b> + feminine country (most ending in -e)</td><td>en France, en Italie, en Angleterre</td></tr>
<tr><td><b>au</b> + masculine country</td><td>au Nigeria, au Canada, au Japon</td></tr>
<tr><td><b>aux</b> + plural country</td><td>aux États-Unis, aux Pays-Bas</td></tr></table>
<p>The same word means both "in" and "to": <i>J'habite <b>en</b> France. Je vais <b>en</b> France.</i></p>
<p><b>chez</b> = at/to someone's place: <i>chez moi, chez le médecin</i>.</p>
<p><b>Coming from:</b> de + city/feminine country, du + masculine: <i>Je viens <b>de</b> Lyon, <b>du</b> Nigeria.</i></p>`,
  },
  {
    id: "y-en", group: "Grammar", level: "B1", title: "The little words y and en",
    body: `
<p><b>y</b> replaces <i>à + place/thing</i> ("there", "about it"):</p>
${ex("Tu vas à la plage ? Oui, j'y vais.", "Are you going to the beach? Yes, I'm going (there).")}
<p><b>en</b> replaces <i>de + thing</i> or a quantity ("some", "of it/them"):</p>
${ex("Tu veux du pain ? Oui, j'en veux. J'en ai deux.", "Do you want some bread? Yes, I want some. I have two (of them).")}
<p><b>Fixed expressions:</b> <i>il y a</i> (there is), <i>on y va</i> (let's go), <i>je m'en vais</i> (I'm leaving), <i>j'en ai marre</i> (I'm fed up), <i>ça y est</i> (that's it).</p>
<p><b>Order</b> when there are several pronouns: <b>me/te/nous/vous → le/la/les → lui/leur → y → en</b>. <i>Il y en a.</i></p>`,
  },

  // ───────── Common mistakes ─────────
  {
    id: "avoir-expressions", group: "Common mistakes", level: "A1", title: "\"I am 20\" is \"I have 20 years\"",
    body: `
<p>Many feelings and states use <b>avoir</b> in French where English uses "to be":</p>
<table class="mini"><tr><td>J'ai 25 ans.</td><td>I'm 25.</td></tr><tr><td>J'ai faim / soif.</td><td>I'm hungry / thirsty.</td></tr>
<tr><td>J'ai chaud / froid.</td><td>I'm hot / cold.</td></tr><tr><td>J'ai peur.</td><td>I'm scared.</td></tr>
<tr><td>J'ai raison / tort.</td><td>I'm right / wrong.</td></tr><tr><td>J'ai sommeil.</td><td>I'm sleepy.</td></tr>
<tr><td>J'ai besoin de…</td><td>I need…</td></tr><tr><td>J'ai envie de…</td><td>I feel like…</td></tr></table>
<p>❌ <i>Je suis chaud</i> doesn't mean "I'm warm"; it means something like "I'm up for it" (or worse!). Say <i>J'ai chaud</i>.</p>
${ex("J'ai froid et j'ai faim.", "I'm cold and hungry.")}`,
  },
  {
    id: "false-friends", group: "Common mistakes", level: "A2", title: "False friends (faux amis)",
    body: `
<table class="mini"><tr><th>French</th><th>means</th><th>not</th></tr>
<tr><td>actuellement</td><td>currently</td><td>actually (= en fait)</td></tr>
<tr><td>une librairie</td><td>a bookshop</td><td>library (= une bibliothèque)</td></tr>
<tr><td>sensible</td><td>sensitive</td><td>sensible (= raisonnable)</td></tr>
<tr><td>attendre</td><td>to wait</td><td>attend (= assister à)</td></tr>
<tr><td>rester</td><td>to stay</td><td>rest (= se reposer)</td></tr>
<tr><td>blesser</td><td>to injure</td><td>bless (= bénir)</td></tr>
<tr><td>la monnaie</td><td>change (coins)</td><td>money (= l'argent)</td></tr>
<tr><td>éventuellement</td><td>possibly</td><td>eventually (= finalement)</td></tr>
<tr><td>excité</td><td>overexcited, aroused</td><td>excited (= j'ai hâte, je suis impatient)</td></tr>
<tr><td>un préservatif</td><td>a condom</td><td>preservative (= un conservateur)</td></tr>
<tr><td>une journée</td><td>a day</td><td>journey (= un voyage)</td></tr>
<tr><td>déception</td><td>disappointment</td><td>deception (= tromperie)</td></tr></table>
<p><b>Tip:</b> "I'm excited to see you!" → <i>J'ai hâte de te voir !</i></p>`,
  },
  {
    id: "savoir-connaitre", group: "Common mistakes", level: "A2", title: "savoir vs connaître (to know)",
    practice: ["present"], verbs: ["savoir", "connaître"],
    body: `
<ul><li><b>savoir</b> = know a <b>fact</b> or <b>how to do something</b>. Often followed by a verb, <i>que</i>, or a question word.</li>
<li><b>connaître</b> = be familiar with a <b>person, place or thing</b>. Always followed by a noun.</li></ul>
${ex("Je sais nager. Je sais où il habite.", "I can swim. I know where he lives.")}
${ex("Je connais Marie. Tu connais Lyon ?", "I know Marie. Do you know Lyon?")}
<p><b>Trick:</b> if you could say "be familiar with" in English, use <i>connaître</i>. And "I can swim" is <i>je <b>sais</b> nager</i> (learned skill), not <i>je peux nager</i>.</p>`,
  },
  {
    id: "cest-ilest", group: "Common mistakes", level: "A2", title: "c'est vs il est",
    body: `
<ul><li><b>il/elle est</b> + adjective or job (no article): <i>Il est grand. Elle est médecin.</i></li>
<li><b>c'est</b> + article/name/pronoun: <i>C'est un médecin. C'est Paul. C'est moi.</i></li>
<li><b>c'est</b> + adjective for a general situation: <i>C'est difficile ! C'est génial.</i></li></ul>
<p>❌ <i>Il est un professeur</i> → ✅ <i>Il est professeur</i> or <i>C'est un professeur</i>.</p>
${ex("Elle est ingénieure. C'est une très bonne ingénieure.", "She's an engineer. She's a very good engineer.")}`,
  },
  {
    id: "time", group: "Common mistakes", level: "A2", title: "depuis, pendant, il y a",
    body: `
<ul><li><b>depuis</b> + <b>present tense</b> = has been doing (and still is): <i>J'apprends le français <b>depuis</b> deux ans.</i> (I've been learning for two years.)</li>
<li><b>pendant</b> = for a finished duration: <i>J'ai vécu à Paris <b>pendant</b> trois ans.</i></li>
<li><b>il y a</b> + time = ago: <i>Je suis arrivé <b>il y a</b> une semaine.</i></li></ul>
<p>❌ <i>J'ai appris le français pour deux ans</i>. Don't translate "for" as <i>pour</i> with durations.</p>
${ex("J'habite ici depuis mars.", "I've lived here since March.")}`,
  },
  {
    id: "tu-vous", group: "Common mistakes", level: "A1", title: "tu or vous? And being polite",
    body: `
<ul><li><b>tu</b>: friends, family, children, people your age in casual settings, and pets.</li>
<li><b>vous</b>: strangers, shops, older people, work contacts, and any group of people.</li></ul>
<p><b>When unsure, use vous.</b> The other person may say <i>on peut se tutoyer</i> (let's use tu).</p>
<h3>Politeness that matters in France</h3>
<ul><li>Always start with <b>Bonjour</b> (or <b>Bonsoir</b> in the evening) before asking anything in a shop.</li>
<li><i>S'il vous plaît, merci, excusez-moi, pardon</i>.</li>
<li><i>Je voudrais…</i> sounds much politer than <i>je veux…</i></li></ul>
${ex("Bonjour madame, je voudrais une baguette, s'il vous plaît.", "Hello, I'd like a baguette, please.")}`,
  },

  // ───────── Pronunciation ─────────
  {
    id: "silent", group: "Pronunciation", level: "A1", title: "Silent letters and liaison",
    body: `
<p><b>Final consonants are usually silent:</b> <i>petit, grand, vous, trop</i>. Remember <b>CaReFuL</b>: final <b>c, r, f, l</b> are often pronounced (<i>avec, finir, neuf, avril</i>), though not -er at the end of verbs (<i>parler</i> = "parlé").</p>
<p>The verb ending <b>-ent</b> is silent: <i>ils parlent</i> sounds like <i>il parle</i>.</p>
<p><b>Liaison:</b> a silent final consonant is pronounced when the next word starts with a vowel: <i>vous‿avez</i> ("vou-za-vé"), <i>les‿amis</i> ("lé-za-mi"), <i>un petit‿enfant</i>.</p>
${ex("Vous avez des amis à Paris ?", "Do you have friends in Paris?")}
<p><b>Never after "et":</b> <i>et | il</i>.</p>`,
  },
  {
    id: "sounds", group: "Pronunciation", level: "A1", title: "Sounds English speakers find hard",
    body: `
<ul><li><b>u vs ou:</b> <i>tu</i> (say "ee" with rounded lips) vs <i>tout</i> ("oo"). <i>dessus</i> (on top) vs <i>dessous</i> (underneath)!</li>
<li><b>Nasal vowels:</b> the n/m isn't pronounced; the air goes through the nose: <i>vin, vent, vont, un</i>.</li>
<li><b>The French r</b> is made at the back of the throat, like a soft gargle: <i>rouge, Paris</i>.</li>
<li><b>é vs è:</b> <i>été</i> (closed, like "ay" without the y) vs <i>mère</i> (open, like "e" in "bed").</li>
<li><b>h</b> is always silent: <i>l'hôtel, l'homme</i>.</li></ul>
${ex("Tu as vu tout ça ?", "Did you see all that?")}
${ex("Un bon vin blanc.", "A good white wine.")}
<p><b>Tip:</b> use Listen every day, and tap 🔊 on any example to hear it.</p>`,
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
