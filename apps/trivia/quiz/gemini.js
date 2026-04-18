// ─── Gemini API Client & Question/Commentary/Summary Generation ──────────────

const fs = require('fs');
const path = require('path');
const { GEMINI_API_KEY, GEMINI_MODEL, OPENROUTER_API_KEY, QUIZ_LLM_MODEL, PERPLEXITY_API_KEY, gameTokenUsage } = require('../config');

// ─── LLM API Client (OpenRouter primary, Gemini fallback) ──────────────────────

async function callLLM(prompt, { timeout = 15000 } = {}) {
  // Prefer Gemini (fast, ~600ms) over OpenRouter (slow, 5-30s on free models)
  if (GEMINI_API_KEY) return callGemini(prompt, { timeout });
  if (OPENROUTER_API_KEY && QUIZ_LLM_MODEL) return callOpenRouter(prompt, { timeout });
  throw new Error('No LLM API key configured');
}

async function callOpenRouter(prompt, { timeout = 15000 } = {}) {
  const body = JSON.stringify({
    model: QUIZ_LLM_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const start = Date.now();
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const elapsed = Date.now() - start;

      if (res.status === 429 || res.status >= 500) {
        console.log(`[llm] ${res.status} on attempt ${attempt + 1} (${elapsed}ms), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const usage = data?.usage;
      if (usage) {
        gameTokenUsage.inputTokens += usage.prompt_tokens || 0;
        gameTokenUsage.outputTokens += usage.completion_tokens || 0;
        gameTokenUsage.calls++;
      }
      console.log(`[llm] ${QUIZ_LLM_MODEL} ok (${elapsed}ms, ${text.length} chars, ${usage?.prompt_tokens || '?'}+${usage?.completion_tokens || '?'} tokens)`);
      return text;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) throw err;
      console.log(`[llm] error on attempt ${attempt + 1}: ${err.message}, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('OpenRouter API failed after all retries');
}

async function callGemini(prompt, { timeout = 15000 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9 }
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const elapsed = Date.now() - start;

      if (res.status === 429 || res.status >= 500) {
        console.log(`[gemini] ${res.status} on attempt ${attempt + 1} (${elapsed}ms), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = data?.usageMetadata;
      if (usage) {
        gameTokenUsage.inputTokens += usage.promptTokenCount || 0;
        gameTokenUsage.outputTokens += usage.candidatesTokenCount || 0;
        gameTokenUsage.thinkingTokens += usage.thoughtsTokenCount || 0;
        gameTokenUsage.calls++;
      }
      const thinking = usage?.thoughtsTokenCount ? `, ${usage.thoughtsTokenCount} thinking` : '';
      console.log(`[gemini] ok (${elapsed}ms, ${text.length} chars, ${usage?.promptTokenCount || '?'}+${usage?.candidatesTokenCount || '?'} tokens${thinking})`);
      return text;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) throw err;
      console.log(`[gemini] error on attempt ${attempt + 1}: ${err.message}, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Gemini API failed after all retries');
}

// ─── Perplexity API Client ───────────────────────────────────────────────────────

async function callPerplexity(prompt, { timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const start = Date.now();
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    console.log(`[perplexity] ok (${elapsed}ms, ${text.length} chars)`);
    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Question Generation ────────────────────────────────────────────────────────

const QUESTION_PROMPT = (topic, count) => `Du bist ein deutscher Quizmaster. Erstelle genau ${count} Trivia-Fragen zum Thema "${topic}".

WICHTIG: Das Thema ist "${topic}" — alle Fragen MÜSSEN sich auf dieses Thema beziehen.
WICHTIG: ALLES muss auf Deutsch sein — Fragen, Antworten, Fun Facts.

Antworte NUR mit einem validen JSON-Array, keine Markdown-Blöcke, kein weiterer Text:
[{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "fun_fact": "..."
}]

Regeln:
- Genau 4 plausible Antwortmöglichkeiten pro Frage, keine offensichtlichen Scherzantworten
- "correct" ist der 0-basierte Index der richtigen Antwort
- Schwierigkeit mischen: einige leicht, meistens mittel, ein paar schwer
- "fun_fact" ist ein überraschender Fakt in einem Satz, der nach der Antwort gezeigt wird
- Fragen sollen interessant und unterhaltsam sein, nicht trocken`;

function validateQuestions(raw) {
  let questions;
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    questions = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(questions)) return null;

  return questions.filter(q =>
    q && typeof q.question === 'string' &&
    Array.isArray(q.options) && q.options.length === 4 &&
    typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3 &&
    typeof q.fun_fact === 'string'
  );
}

const PERPLEXITY_QUESTION_PROMPT = (topic, count) => `Recherchiere interessante und überraschende Fakten zum Thema "${topic}" und erstelle daraus genau ${count} Trivia-Quizfragen.

WICHTIG: Nutze deine Suchfähigkeit um echte, verifizierte Fakten zu finden. Die Fragen sollen auf realen Informationen basieren, nicht auf allgemeinem Wissen.
WICHTIG: ALLES muss auf Deutsch sein — Fragen, Antworten, Fun Facts.
WICHTIG: Alle Fragen MÜSSEN sich auf "${topic}" beziehen.

Antworte NUR mit einem validen JSON-Array, keine Markdown-Blöcke, kein weiterer Text:
[{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "fun_fact": "..."
}]

Regeln:
- Genau 4 plausible Antwortmöglichkeiten pro Frage, keine offensichtlichen Scherzantworten
- "correct" ist der 0-basierte Index der richtigen Antwort
- Schwierigkeit mischen: einige leicht, meistens mittel, ein paar schwer
- "fun_fact" ist ein überraschender, recherchierter Fakt in einem Satz
- Fragen sollen kreativ, überraschend und unterhaltsam sein — keine Standard-Wikipedia-Fragen`;

async function generateQuestions(topic, count) {
  // Try Perplexity first (search-grounded, better facts)
  if (PERPLEXITY_API_KEY) {
    try {
      const raw = await callPerplexity(PERPLEXITY_QUESTION_PROMPT(topic, count));
      const questions = validateQuestions(raw);
      if (questions && questions.length >= Math.floor(count / 2)) {
        console.log(`[questions] perplexity generated ${questions.length}/${count} for "${topic}"`);
        return questions;
      }
      console.log(`[questions] perplexity validation failed, trying gemini`);
    } catch (err) {
      console.log(`[questions] perplexity failed: ${err.message}, trying gemini`);
    }
  }

  // Fallback to Gemini/OpenRouter
  try {
    const raw = await callLLM(QUESTION_PROMPT(topic, count));
    const questions = validateQuestions(raw);
    if (questions && questions.length >= Math.floor(count / 2)) {
      console.log(`[questions] gemini generated ${questions.length}/${count} for "${topic}"`);
      return questions;
    }
    console.log(`[questions] gemini validation failed, using fallback`);
  } catch (err) {
    console.log(`[questions] gemini failed: ${err.message}, using fallback`);
  }
  return getFallbackQuestions(count);
}

// ─── Fallback Question Bank ─────────────────────────────────────────────────────

let fallbackBank = [];
try {
  fallbackBank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
} catch {
  console.log('[fallback] questions.json not found or invalid, fallback disabled');
}

function getFallbackQuestions(count) {
  if (fallbackBank.length === 0) {
    // Emergency hardcoded set
    return Array.from({ length: count }, (_, i) => ({
      question: `Fallback question ${i + 1}: What is 2 + ${i}?`,
      options: [`${i + 1}`, `${i + 2}`, `${i + 3}`, `${i + 4}`],
      correct: 1,
      fun_fact: 'The fallback questions kicked in — AI was unavailable!'
    }));
  }
  const shuffled = [...fallbackBank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── AI Commentary ──────────────────────────────────────────────────────────────

const COMMENTARY_TEMPLATES = [
  (s) => s.allWrong ? "Das wusste keiner? Wirklich?" : null,
  (s) => s.allCorrect ? "Zu einfach! Alle richtig." : null,
  (s) => s.topStreak > 4 ? `${s.streakPlayer} ist gerade absolut on fire!` : null,
  (s) => s.topStreak === 3 ? `${s.streakPlayer} baut eine nette Serie auf...` : null,
  (s) => s.closeRace ? "Kopf an Kopf an der Spitze!" : null,
  (s) => s.soloCorrect ? `Nur ${s.soloCorrect} wusste das. Respekt.` : null,
  (s) => s.fastestTime < 2000 ? `${s.fastestPlayer} hat in unter 2 Sekunden geantwortet. Verdächtig... oder genial.` : null,
  () => "Mal sehen, wer am Ende vorne liegt.",
  () => "Das wird langsam spannend.",
  () => "Die nächste wird schwieriger.",
];

function getTemplateCommentary(state) {
  for (const fn of COMMENTARY_TEMPLATES) {
    const result = fn(state);
    if (result) return result;
  }
  const generic = [
    "Weiter so!", "Es wird immer spannender.",
    "Wer übernimmt die Führung?", "Aufgepasst!",
    "Das war eine knifflige Frage.", "Auf geht's..."
  ];
  return generic[Math.floor(Math.random() * generic.length)];
}

const COMMENTARY_PROMPT = (gameState) => `Du bist Atlas, ein witziger Quiz-Moderator. Schreibe einen KURZEN Kommentar (max 15 Wörter, auf Deutsch) zu diesem Quiz-Moment.

Spielstand:
- Frage war: "${gameState.question}"
- ${gameState.correctCount}/${gameState.totalPlayers} richtig
- Führender: ${gameState.leader} (${gameState.leaderScore} Punkte)
${gameState.topStreak > 2 ? `- ${gameState.streakPlayer} hat eine ${gameState.topStreak}er-Serie` : ''}
${gameState.allWrong ? '- Niemand hatte recht!' : ''}

Antworte NUR mit dem Kommentar auf Deutsch, keine Anführungszeichen, keine Erklärung.`;

async function generateCommentary(gameState) {
  try {
    const text = await callLLM(COMMENTARY_PROMPT(gameState), { timeout: 5000 });
    const line = text.trim().split('\n')[0].slice(0, 100);
    if (line.length > 5) return line;
  } catch {}
  return getTemplateCommentary(gameState);
}

// ─── Game Summary ───────────────────────────────────────────────────────────────

const SUMMARY_PROMPT = (results) => `Du bist Atlas, ein charismatischer Quiz-Moderator. Schreibe eine kurze Zusammenfassung der Spielergebnisse (4-5 Zeilen, auf Deutsch) für einen Telegram-Gruppenchat.

Ergebnisse:
${results.standings.map((p, i) => `${i + 1}. ${p.name} — ${p.score} Punkte (${p.correct}/${results.totalQuestions} richtig)`).join('\n')}

Thema: ${results.topic}
Fragen: ${results.totalQuestions}

Beinhalte:
- Gewinner-Ankündigung
- Einen lustigen Superlativ (z.B. "Blitzmerker", "Comeback-König")
- Einen lockeren Abschluss-Satz

Schreibe auf Deutsch. Locker und lustig. Nutze Markdown (fett mit *). Keine Emojis. Antworte NUR mit dem Text.`;

async function generateSummary(results) {
  try {
    const text = await callLLM(SUMMARY_PROMPT(results), { timeout: 8000 });
    if (text.trim().length > 20) return text.trim();
  } catch {}

  // Template fallback
  const top = results.standings[0];
  return [
    `*Trivia Results — ${results.topic}*`,
    '',
    results.standings.map((p, i) => `${i === 0 ? '👑' : `${i + 1}.`} ${p.name} — ${p.score} pts`).join('\n'),
    '',
    `${top.name} holt sich die Krone! Mehr Glück beim nächsten Mal.`
  ].join('\n');
}

module.exports = {
  generateQuestions,
  getFallbackQuestions,
  generateCommentary,
  getTemplateCommentary,
  generateSummary,
  gameTokenUsage
};
