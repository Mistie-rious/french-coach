// "Mode immersion": shows the app's own interface in French.
// Works on rendered DOM text (exact phrases + patterns), so views stay written in English and
// learner content (texts, glosses, conversations) is never touched: it simply never matches.

const KEY = "ui_lang";
export const uiLang = () => {
  try { return localStorage.getItem(KEY) || "en"; } catch { return "en"; }
};
export function setUiLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch {}
}
export const isFrench = () => uiLang() === "fr";

const EXACT = {
  // navigation & common
  "Today": "Aujourd'hui", "Learn": "Apprendre", "Read": "Lire", "Talk": "Parler", "Write": "Écrire", "Me": "Moi", "Listen": "Écouter",
  "Next": "Suivant", "Next →": "Suivant →", "Save": "Enregistrer", "Delete": "Supprimer", "Remove": "Retirer",
  "Add": "Ajouter", "Start": "Commencer", "Check": "Vérifier", "Show": "Voir", "Hint": "Indice", "💡 Hint": "💡 Indice",
  "Reveal": "Révéler", "Finish": "Terminer", "Test": "Tester", "New": "Nouveau", "Easier": "Plus facile", "Harder": "Plus difficile",
  "Shorter": "Plus court", "Longer": "Plus long", "Short": "Court", "Medium": "Moyen", "Long": "Long", "Level": "Niveau", "Length": "Longueur",
  "All": "Tous", "Word": "Mot", "Sentence": "Phrase", "Words": "Mots", "Verbs": "Verbes", "Sentences": "Phrases", "Listening": "Écoute",
  "Mistakes": "Erreurs", "Writing": "Textes", "Front": "Recto", "Back": "Verso", "Note": "Note", "Done ✓": "Terminé ✓", "Done again ✓": "Encore terminé ✓",
  "Saved ✓": "Enregistré ✓", "Already saved ✓": "Déjà enregistré ✓", "done": "fait", "fait ✓": "fait ✓", "Settings": "Réglages", "⚙︎ Settings": "⚙︎ Réglages",
  "Petit à Petit": "Petit à Petit", "No hint yet": "Pas encore d'indice",

  // today
  "Warm-up review": "Échauffement", "Drill today's mistakes": "Revoir les erreurs du jour", "pick or generate a text": "choisis ou crée un texte",
  "after writing": "après l'écriture", "jour 🔥": "jour 🔥", "jours 🔥": "jours 🔥",
  "No Claude key yet: texts come from the built-in set, word lookups use the offline dictionary, and corrections use LanguageTool only.":
    "Pas encore de clé Claude : les textes viennent de la sélection intégrée, les mots du dictionnaire hors ligne, et les corrections de LanguageTool.",
  "Add a key →": "Ajouter une clé →", "C'est fini pour aujourd'hui. Bravo ! ✨": "C'est fini pour aujourd'hui. Bravo ! ✨",
  "💾 Time for a backup. Your data only lives on this phone →": "💾 C'est l'heure d'une sauvegarde : tes données ne sont que sur ce téléphone →",

  // review
  "Review": "Révision", "Drill": "Entraînement", "Show answer": "Voir la réponse", "Again": "À revoir", "Hard": "Difficile", "Good": "Bien", "Easy": "Facile",
  "Remove card": "Retirer la carte", "word": "mot", "sentence": "phrase", "translate it": "traduis-la", "fix the mistake": "corrige l'erreur",
  "listen": "écoute", "what do you hear?": "qu'entends-tu ?", "conjugate": "conjugue", "Full table →": "Toute la conjugaison →",
  "No mistakes left to drill today. 👌": "Plus d'erreurs à revoir aujourd'hui. 👌", "Nothing due. 🎉": "Rien à réviser. 🎉",
  "Back to today": "Retour à aujourd'hui", "Keep going →": "Continuer →",

  // read
  "✨ New text": "✨ Nouveau texte", "Paste a French text": "Coller un texte en français", "No texts yet.": "Pas encore de textes.",
  "read": "lu", "new": "nouveau", "claude": "claude", "paste": "collé", "builtin": "intégré",
  "Tap a word for its meaning; save it to review.": "Touche un mot pour son sens ; garde-le pour le réviser.",
  "Tap a sentence to translate it; save it to review.": "Touche une phrase pour la traduire ; garde-la pour la réviser.",
  "Rewrite this text": "Réécrire ce texte", "▶ Listen": "▶ Écouter", "■ Stop": "■ Arrêter", "Save sentence": "Garder la phrase",
  "Save to review": "Garder pour réviser", "✦ Explain grammar": "✦ Expliquer la grammaire", "Dictionary": "Dictionnaire",
  "✦ Ask Claude (meaning in this sentence)": "✦ Demander à Claude (sens dans cette phrase)", "Asking Claude…": "Claude réfléchit…",
  "Translating": "Traduction", "Writing your text… (~20s)": "Écriture du texte… (~20 s)", "Rewriting…": "Réécriture…",
  "Built-in text (add a Claude key for texts at your level)": "Texte intégré (ajoute une clé Claude pour des textes à ton niveau)",
  "Add a translation first": "Ajoute d'abord une traduction", "Free translation limit reached for today": "Limite de traductions gratuites atteinte pour aujourd'hui",

  // write
  "🇬🇧 English": "🇬🇧 Anglais", "Stuck? Tap a starter:": "Bloqué·e ? Touche un début de phrase :", "Correct it": "Corriger",
  "Correcting… (~10s)": "Correction… (~10 s)", "Correction": "Correction", "Corrected text": "Texte corrigé", "🇬🇧 Show in English": "🇬🇧 Voir en anglais",
  "Drill these mistakes →": "Revoir ces erreurs →",

  // listen
  "▶ Listen again": "▶ Réécouter", "Next sentence →": "Phrase suivante →", "the answer": "la réponse", "Extra words you typed:": "Mots en trop :",
  "Added to your reviews so you hear it again.": "Ajoutée à tes révisions pour la réentendre.", "Added to your reviews.": "Ajouté à tes révisions.",
  "Voice:": "Voix :", "Parfait !": "Parfait !",

  // learn
  "New words": "Nouveaux mots", "Conjugation": "Conjugaison", "Tips & tricks": "Astuces", "Dictation with native speakers (Tatoeba)": "Dictées avec des natifs (Tatoeba)",
  "Drill verbs tense by tense": "Entraîne-toi temps par temps", "22 short lessons: verbs, grammar, common mistakes, pronunciation": "22 petites leçons : verbes, grammaire, erreurs fréquentes, prononciation",
  "All words": "Tous les mots", "I know it": "Je connais", "Show more": "Voir plus", "Table": "Tableau", "Verbs:": "Verbes :", "Top 20": "Top 20", "Top 50": "Top 50", "Top 100": "Top 100",
  "Juste !": "Juste !", "Almost: check the accents": "Presque : vérifie les accents", "Pas tout à fait": "Pas tout à fait",
  "Practise this →": "S'entraîner →", "Past participle:": "Participe passé :", "· auxiliary:": "· auxiliaire :", "auxiliary:": "auxiliaire :",
  "avoir or être": "avoir ou être", "être (reflexive)": "être (pronominal)", "Pick at least one tense.": "Choisis au moins un temps.", "Look up a verb: aller, suis, se lever…": "Chercher un verbe : aller, suis, se lever…",
  "Grammar": "Grammaire", "Common mistakes": "Erreurs fréquentes", "Pronunciation": "Prononciation",
  "noun": "nom", "verb": "verbe", "adj": "adj.", "adv": "adv.", "phrase": "expression", "known": "connu", "learning": "en cours",
  "conjugation": "conjugaison", "removed from reviews": "retiré des révisions",
  // lesson titles
  "The present tense: three families": "Le présent : trois familles", "The four verbs you need most": "Les quatre verbes essentiels",
  "Passé composé: avoir or être?": "Passé composé : avoir ou être ?", "Imparfait vs passé composé": "Imparfait ou passé composé",
  "Talking about the future": "Parler du futur", "The conditional: would, could, should": "Le conditionnel", "The subjunctive: when and how": "Le subjonctif : quand et comment",
  "Reflexive verbs: se lever, s'appeler…": "Les verbes pronominaux", "Guessing a noun's gender": "Deviner le genre d'un nom",
  "le, un, du: which article?": "le, un, du : quel article ?", "Saying no: ne … pas and friends": "La négation : ne … pas et compagnie",
  "Three ways to ask a question": "Trois façons de poser une question", "à, en, au: talking about places": "à, en, au : parler des lieux",
  "The little words y and en": "Les petits mots y et en", "\"I am 20\" is \"I have 20 years\"": "« J'ai 20 ans », pas « je suis 20 »",
  "False friends (faux amis)": "Les faux amis", "savoir vs connaître (to know)": "savoir ou connaître", "c'est vs il est": "c'est ou il est",
  "depuis, pendant, il y a": "depuis, pendant, il y a", "tu or vous? And being polite": "tu ou vous ? Et la politesse",
  "Silent letters and liaison": "Lettres muettes et liaison", "Sounds English speakers find hard": "Les sons difficiles pour les anglophones",

  // talk
  "Describe the situation": "Décris la situation", "Recent conversations": "Conversations récentes", "Read replies aloud": "Lire les réponses à voix haute",
  "finished": "terminée", "Another conversation": "Une autre conversation", "Bien joué !": "Bien joué !", "✓ parfait": "✓ parfait",
  "Conversations need a Claude key.": "Les conversations ont besoin d'une clé Claude.", "Add one in Settings →": "En ajouter une dans les réglages →",
  "← Parler": "← Parler", "🎯 Goal reached! Keep chatting or tap Finish.": "🎯 Objectif atteint ! Continue ou touche Terminer.",
  "Tip: use the 🎤 on your keyboard (French keyboard) to dictate.": "Astuce : utilise le 🎤 du clavier (clavier français) pour dicter.",
  "Add a Claude key in Settings first": "Ajoute d'abord une clé Claude dans les réglages", "Microphone access was blocked": "L'accès au micro est bloqué",
  // scenario goals
  "Order something to drink and eat, ask a question about the menu, then ask for the bill.": "Commande à boire et à manger, pose une question sur la carte, puis demande l'addition.",
  "Buy bread and a pastry, ask what they recommend, and pay.": "Achète du pain et une viennoiserie, demande un conseil, puis paie.",
  "Introduce yourself, say where you're from and what you do, and suggest meeting up.": "Présente-toi, dis d'où tu viens et ce que tu fais, et propose de vous revoir.",
  "Tell your friend about your weekend and ask about theirs.": "Raconte ton week-end à ton ami·e et demande-lui le sien.",
  "Ask how to get to the train station and check you understood the directions.": "Demande comment aller à la gare et vérifie que tu as compris.",
  "Buy a ticket to Bordeaux, find out about the cancellation and choose another train.": "Achète un billet pour Bordeaux, renseigne-toi sur l'annulation et choisis un autre train.",
  "Politely explain the problem and get it fixed.": "Explique poliment le problème et obtiens une solution.",
  "Explain your symptoms (you've had a sore throat and fever for three days) and understand the advice.": "Explique tes symptômes (mal à la gorge et fièvre depuis trois jours) et comprends les conseils.",
  "Ask about the rent, charges, neighbourhood and when you can move in.": "Pose des questions sur le loyer, les charges, le quartier et la date d'emménagement.",
  "Explain the problem, answer their questions and get a solution.": "Explique le problème, réponds aux questions et obtiens une solution.",
  "Present yourself, talk about your experience and ask a question about the job.": "Présente-toi, parle de ton expérience et pose une question sur le poste.",
  "Give your opinion with reasons and respond to theirs.": "Donne ton avis avec des arguments et réponds au sien.",
  "Just talk! Keep the conversation going.": "Discute ! Fais durer la conversation.", "Handle the situation successfully.": "Gère la situation avec succès.",

  // me / stats / data / settings
  "day streak": "jours d'affilée", "words known": "mots connus", "recall (30d)": "mémorisation (30 j)", "Last 4 weeks": "Les 4 dernières semaines",
  "Top mistakes this week": "Erreurs fréquentes cette semaine", "No mistakes logged this week.": "Aucune erreur cette semaine.",
  "💾 My data & backup": "💾 Mes données et sauvegarde", "My data": "Mes données", "💾 Back up now": "💾 Sauvegarder", "Export CSV": "Exporter en CSV",
  "Restore…": "Restaurer…", "Preparing…": "Préparation…", "Backup ready ✓": "Sauvegarde prête ✓", "Restored ✓": "Restauré ✓",
  "Appearance": "Apparence", "Light": "Clair", "Dark": "Sombre", "Auto": "Auto", "App language": "Langue de l'app",
  "Claude API key": "Clé API Claude", "Save key": "Enregistrer la clé", "Key saved ✓": "Clé enregistrée ✓", "Key removed": "Clé supprimée", "Testing…": "Test…",
  "Stored only on this phone (not in backups). Get one at console.anthropic.com and set a monthly spend limit there.":
    "Gardée uniquement sur ce téléphone (pas dans les sauvegardes). Crée-la sur console.anthropic.com et fixe une limite de dépenses mensuelle.",
  "Warm-up review size": "Taille de l'échauffement", "New cards per day": "Nouvelles cartes par jour", "Claude this month": "Claude ce mois-ci",
  "No Claude calls yet this month.": "Aucun appel à Claude ce mois-ci.",
  "Estimated from token counts at Haiku 4.5 prices. Your Anthropic Console shows the exact bill.": "Estimation d'après les tokens au tarif Haiku 4.5. La console Anthropic indique le montant exact.",
  "Free translations": "Traductions gratuites",
  "Sentence translations come from MyMemory (free, no key): about 5,000 characters a day. Adding your email raises that to about 50,000 a day. It's only sent to MyMemory.":
    "Les traductions viennent de MyMemory (gratuit, sans clé) : environ 5 000 caractères par jour. Avec ton e-mail, environ 50 000. Il n'est envoyé qu'à MyMemory.",
  "Conversations": "Conversations", "Corrections": "Corrections", "New texts": "Nouveaux textes", "Rewrites": "Réécritures", "Ask Claude (words)": "Demander à Claude (mots)",
  "Explain grammar": "Expliquer la grammaire", "Writing prompts": "Sujets d'écriture", "Key test": "Test de la clé", "Other": "Autre",
  "Replace ALL data on this phone with this backup?": "Remplacer TOUTES les données de ce téléphone par cette sauvegarde ?",
  "Delete permanently, including its review history?": "Supprimer définitivement, avec son historique de révision ?",
  "Delete this text? Saved words stay.": "Supprimer ce texte ? Les mots gardés restent.",
  "Remove this card from reviews? (You can restore it in My data.)": "Retirer cette carte des révisions ? (Tu peux la remettre dans Mes données.)",
  "English": "English", "Français": "Français",
  "💬 Just talk": "💬 Discuter", "Situations": "Situations",
  "Chat with Camille about anything. You can also ask questions about French, even in English.": "Discute de tout avec Camille. Tu peux aussi poser des questions sur le français, même en anglais.",
  "Ask anything about French too, even in English.": "Pose aussi des questions sur le français, même en anglais.",
  // typed answers in review
  "Type the correct version of the highlighted part:": "Écris la bonne version de la partie surlignée :", "I don't know": "Je ne sais pas",
  "Your answer…": "Ta réponse…", "Type what you hear…": "Écris ce que tu entends…", "You wrote:": "Tu as écrit :", "Presque !": "Presque !",
  "Claude is checking your version": "Claude vérifie ta version", "Check the accents.": "Vérifie les accents.", "Answer checks": "Vérifications",
  "Add your own": "Ajouter les tiens", "Type a French word or sentence, see what it means, save it to review": "Écris un mot ou une phrase en français, vois ce que ça veut dire, garde-le pour réviser",
  "Type a French word or sentence you've come across. You'll see what it means, then you can save it to your reviews.": "Écris un mot ou une phrase que tu as croisé. Tu verras le sens, puis tu pourras le garder dans tes révisions.",
  "Translate": "Traduire", "Translating…": "Traduction…", "Meaning to learn": "Sens à retenir", "Translation": "Traduction", "Recently added": "Ajoutés récemment",
  "Add a meaning first": "Ajoute d'abord un sens", "Review my words": "Réviser mes mots", "My words": "Mes mots",
  "all caught up": "tout est à jour", "None of your words are due right now. 👌": "Aucun de tes mots à réviser pour l'instant. 👌", "Add more →": "En ajouter →", "Translations": "Traductions", "Backup translator": "Traducteur de secours",
  "Translations come from Claude. Without a key (or if Claude is unreachable) the app falls back to MyMemory: free but less reliable, about 5,000 characters a day. Adding your email raises that to about 50,000. It's only sent to MyMemory.":
    "Les traductions viennent de Claude. Sans clé (ou si Claude est injoignable), l'app utilise MyMemory : gratuit mais moins fiable, environ 5 000 caractères par jour. Avec ton e-mail, environ 50 000. Il n'est envoyé qu'à MyMemory.", "Dictionary (tap one to use it):": "Dictionnaire (touche un sens pour le choisir) :",
  // feuilleton
  "Start a different story": "Commencer une autre histoire", "Next episode →": "Épisode suivant →", "✨ Next episode": "✨ Épisode suivant",
  "A story in episodes, written at your level, with the same characters every day. Pick a genre:": "Une histoire en épisodes, à ton niveau, avec les mêmes personnages chaque jour. Choisis un genre :",
  "Writing episode 1… (~20s)": "Écriture de l'épisode 1… (~20 s)", "Writing the next episode… (~20s)": "Écriture de l'épisode suivant… (~20 s)",
  "The feuilleton needs a Claude key (Settings)": "Le feuilleton a besoin d'une clé Claude (Réglages)", "Feuilleton": "Feuilleton",
  // hidden labels & placeholders
  "Close": "Fermer", "Play": "Écouter", "Play slowly": "Écouter lentement", "Pronounce": "Prononcer", "Search…": "Rechercher…",
  "Send": "Envoyer", "Speak": "Parler", "Title (optional)": "Titre (facultatif)", "Translate": "Traduire", "Email (optional)": "E-mail (facultatif)",
  "e.g. Returning a jacket that's too small to a clothes shop": "ex. : rapporter une veste trop petite dans un magasin",
  "listening": "écoute", "dictionary form": "forme du dictionnaire", "meaning in English": "sens en anglais",
  "Type your own translation": "Écris ta propre traduction", "Title": "Titre", "Email": "E-mail",

  // error categories
  "agreement": "accord", "gender": "genre", "verb tense": "temps", "verb_tense": "temps", "mood": "mode", "prepositions": "prépositions",
  "articles": "articles", "pronouns": "pronoms", "word order": "ordre des mots", "negation": "négation", "spelling": "orthographe",
  "vocabulary": "vocabulaire", "register": "registre", "punctuation": "ponctuation", "other": "autre",
};

const PLURAL = { words: "mots", verbs: "verbes", sentences: "phrases", listening: "écoutes", mistakes: "erreurs", writing: "textes" };
const s = (n) => (Number(n) > 1 ? "s" : "");

const PATTERNS = [
  [/^(\d+) \/ (\d+) sentences$/, (m) => `${m[1]} / ${m[2]} phrases`],
  [/^(\d+) \/ (\d+) today$/, (m) => `${m[1]} / ${m[2]} aujourd'hui`],
  [/^(\d+) of (\d+) done$/, (m) => `${m[1]} sur ${m[2]} faits`],
  [/^(\d+) reviewed$/, (m) => `${m[1]} révisée${s(m[1])}`],
  [/^(\d+) due$/, (m) => `${m[1]} à revoir`],
  [/^Corrected from « (.+) »$/, (m) => `Corrigé de « ${m[1]} »`],
  [/^Literally: (.*)$/, (m) => `Littéralement : ${m[1]}`],
  [/^Not among the (\d+) verbs here\.$/, (m) => `Pas parmi les ${m[1]} verbes de l'appli.`],
  [/^(\d+) of yours to review$/, (m) => `${m[1]} des tiens à réviser`],
  [/^Review my words \((\d+)\) →$/, (m) => `Réviser mes mots (${m[1]}) →`],
  [/^(\d+) cards due$/, (m) => `${m[1]} cartes à revoir`],
  [/^(\d+) to drill$/, (m) => `${m[1]} à revoir`],
  [/^(\d+) left$/, (m) => `encore ${m[1]}`],
  [/^(\d+) to review$/, (m) => `${m[1]} à revoir`],
  [/^(\d+) sentences?$/, (m) => `${m[1]} phrase${s(m[1])}`],
  [/^(\d+) messages?$/, (m) => `${m[1]} message${s(m[1])}`],
  [/^(\d+) corrections?$/, (m) => `${m[1]} correction${s(m[1])}`],
  [/^(\d+) fix(?:es)?$/, (m) => `${m[1]} correction${s(m[1])}`],
  [/^(\d+) err$/, (m) => `${m[1]} err.`],
  [/^(\d+) (words|verbs|sentences|listening|mistakes|writing)$/, (m) => `${m[1]} ${PLURAL[m[2]]}`],
  [/^(\d+)m$/, (m) => `${m[1]} min`], [/^(\d+)h$/, (m) => `${m[1]} h`], [/^(\d+)d$/, (m) => `${m[1]} j`], [/^(\d+)mo$/, (m) => `${m[1]} mois`],
  [/^You missed « (.+) »\.$/, (m) => `Il manque « ${m[1]} ».`],
  [/^« (.+) » isn't needed\.$/, (m) => `« ${m[1]} » n'est pas nécessaire.`],
  [/^Translator: (.*)$/, (m) => `Traducteur : ${m[1]}`],
  [/^Claude: (.*)$/, (m) => `Claude : ${m[1]}`],
  [/^Read episode (\d+) →$/, (m) => `Lire l'épisode ${m[1]} →`],
  [/^✨ Episode (\d+)$/, (m) => `✨ Épisode ${m[1]}`],
  [/^🔥 (\d+) in a row$/, (m) => `🔥 ${m[1]} d'affilée`],
  [/^of (\d+) saved$/, (m) => `sur ${m[1]} enregistrés`],
  [/^also: (.*)$/, (m) => `aussi : ${m[1]}`],
  [/^Original: (.*)$/, (m) => `Original : ${m[1]}`],
  [/^Practise (.+)$/, (m) => `S'entraîner : ${m[1]}`],
  [/^Practising: (.*)$/, (m) => `Entraînement : ${m[1]}`],
  [/^See the full table for (.+) →$/, (m) => `Toute la conjugaison de ${m[1]} →`],
  [/^Checked with (.+)\.$/, (m) => `Corrigé par ${tr(m[1])}.`],
  [/^“(.+)” added to your reviews$/, (m) => `« ${m[1]} » ajouté à tes révisions`],
  [/^Works ✓ Claude says: (.*)$/, (m) => `Ça marche ✓ Claude dit : ${m[1]}`],
  [/^🎯 (.+)$/, (m) => `🎯 ${tr(m[1])}`],
  [/^Warm-up done: (\d+) cards today\.$/, (m) => `Échauffement terminé : ${m[1]} cartes aujourd'hui.`],
  [/^Listen, then type exactly what you hear\. Level (\w+)\.$/, (m) => `Écoute, puis écris exactement ce que tu entends. Niveau ${m[1]}.`],
  [/^Pick a situation\. Claude plays the other person at your level \((\w+)\)\. Type or speak; corrections are saved for review\.$/,
    (m) => `Choisis une situation. Claude joue l'autre personne à ton niveau (${m[1]}). Écris ou parle ; les corrections vont dans tes révisions.`],
  [/^Common (\w+) words and verbs you haven't learned yet · (\d+) saved, (\d+) already known$/,
    (m) => `Mots et verbes ${m[1]} courants à découvrir · ${m[2]} gardés, ${m[3]} déjà connus`],
  [/^The most common (\w+) (words|verbs) you haven't saved yet\.$/, (m) => `Les ${m[2] === "verbs" ? "verbes" : "mots"} ${m[1]} les plus courants que tu n'as pas encore gardés.`],
  [/^adds it to your reviews;$/, () => "l'ajoute à tes révisions ;"],
  [/^hides it for good\.$/, () => "le masque pour de bon."],
  [/^You sent (\d+) messages? with (\d+) things? to fix\. They're in your reviews now\.$/,
    (m) => `Tu as envoyé ${m[1]} message${s(m[1])} avec ${m[2]} point${s(m[2])} à corriger. Ils sont dans tes révisions.`],
  [/^You sent (\d+) messages? without a single mistake\.$/, (m) => `Tu as envoyé ${m[1]} message${s(m[1])} sans une seule erreur.`],
  [/^Everything lives on this phone\. (No backup yet\.|Last backup: (.+)\.) The backup is a SQLite file — open it with any SQLite viewer \(e\.g\. DB Browser for SQLite\)\.$/,
    (m) => `Tout est sur ce téléphone. ${m[2] ? `Dernière sauvegarde : ${m[2]}.` : "Pas encore de sauvegarde."} La sauvegarde est un fichier SQLite, lisible avec n'importe quel lecteur SQLite (ex. DB Browser for SQLite).`],
  [/^((?:noun|verb|adj|adv|phrase)(?:, (?:noun|verb|adj|adv|phrase))+)$/, (m) => m[1].split(", ").map((p) => EXACT[p]).join(", ")],
];

/** French for an English UI string, or null if it isn't one. */
export function tr(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (Object.hasOwn(EXACT, t)) return EXACT[t];
  for (const [re, fn] of PATTERNS) {
    const m = t.match(re);
    if (m) {
      const out = fn(m);
      if (out != null) return out;
    }
  }
  if (t.includes(" · ")) {
    const parts = t.split(" · ");
    const out = parts.map((p) => tr(p) ?? p);
    if (out.some((p, i) => p !== parts[i])) return out.join(" · ");
  }
  return null;
}

/** For strings passed to confirm()/toast() and the like. */
export const t = (text) => (isFrench() ? tr(text) ?? text : text);

// Content that must never be translated (learner texts, examples, conversations, lessons' bodies).
const SKIP = ".reading, .context, .bubble p, .ex, .dict, .conj-table, .prompt p, .notes, .lesson, textarea, input, script, style, [data-raw]";
const ATTRS = ["placeholder", "aria-label", "title"];

const translateAttrs = (el) => {
  if (el.closest("[data-raw]")) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    const out = v && tr(v);
    if (out) el.setAttribute(a, out);
  }
};

// Text inside content areas is left alone; attributes (placeholders, button labels) are always UI.
function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const out = tr(node.nodeValue);
    if (out != null && out !== node.nodeValue.trim()) {
      const lead = node.nodeValue.match(/^\s*/)[0];
      const trail = node.nodeValue.match(/\s*$/)[0];
      node.nodeValue = lead + out + trail;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === Node.TEXT_NODE) translateNode(n);
    else translateAttrs(n);
  }
}

/** Turn on French UI: translate now and whenever the page changes. */
export function startImmersion() {
  if (!isFrench()) return;
  document.documentElement.classList.add("ui-fr");
  translateNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
