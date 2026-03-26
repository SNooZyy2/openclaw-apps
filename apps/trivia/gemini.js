// ─── Gemini API Client & Question/Commentary/Summary Generation ──────────────

const fs = require('fs');
const path = require('path');
const { GEMINI_API_KEY, GEMINI_MODEL, OPENROUTER_API_KEY, QUIZ_LLM_MODEL, gameTokenUsage } = require('./config');

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

// ─── Question Generation ────────────────────────────────────────────────────────

const QUESTION_PROMPT = (topic, count) => `Generate exactly ${count} trivia questions about "${topic}".

Return ONLY a valid JSON array, no markdown fences, no extra text:
[{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "fun_fact": "..."
}]

Rules:
- ALL text MUST be in German (questions, options, fun_fact — everything)
- Exactly 4 plausible options per question, no obvious joke answers
- "correct" is the 0-based index of the right answer
- Mix difficulty: some easy, mostly medium, a couple hard
- "fun_fact" is a surprising one-sentence fact shown after the answer
- Questions should be interesting and engaging, not dry textbook style`;

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

async function generateQuestions(topic, count) {
  try {
    const raw = await callLLM(QUESTION_PROMPT(topic, count));
    const questions = validateQuestions(raw);
    if (questions && questions.length >= Math.floor(count / 2)) {
      console.log(`[questions] generated ${questions.length}/${count} for "${topic}"`);
      return questions;
    }
    console.log(`[questions] validation failed, using fallback`);
  } catch (err) {
    console.log(`[questions] generation failed: ${err.message}, using fallback`);
  }
  return getFallbackQuestions(count);
}

// ─── Fallback Question Bank ─────────────────────────────────────────────────────

let fallbackBank = [];
try {
  fallbackBank = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
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

const COMMENTARY_PROMPT = (gameState) => `You are Atlas, a witty AI game host. Generate a SHORT one-liner commentary (max 15 words) for a trivia game moment.

Game state:
- Question was: "${gameState.question}"
- ${gameState.correctCount}/${gameState.totalPlayers} got it right
- Current leader: ${gameState.leader} (${gameState.leaderScore} pts)
${gameState.topStreak > 2 ? `- ${gameState.streakPlayer} is on a ${gameState.topStreak}-question streak` : ''}
${gameState.allWrong ? '- Nobody got it right!' : ''}

Reply in German. Reply with ONLY the one-liner, no quotes, no explanation.`;

async function generateCommentary(gameState) {
  try {
    const text = await callLLM(COMMENTARY_PROMPT(gameState), { timeout: 5000 });
    const line = text.trim().split('\n')[0].slice(0, 100);
    if (line.length > 5) return line;
  } catch {}
  return getTemplateCommentary(gameState);
}

// ─── Game Summary ───────────────────────────────────────────────────────────────

const SUMMARY_PROMPT = (results) => `You are Atlas, a charismatic AI trivia host. Write a brief game results summary (4-5 lines) for a Telegram group chat.

Results:
${results.standings.map((p, i) => `${i + 1}. ${p.name} — ${p.score} pts (${p.correct}/${results.totalQuestions} correct)`).join('\n')}

Topic: ${results.topic}
Questions: ${results.totalQuestions}

Include:
- Winner announcement
- One fun superlative (e.g., "Speed Demon", "Comeback Kid")
- A playful closing line

Write in German. Keep it casual and fun. Use basic Markdown (bold with *). No emojis. Reply with ONLY the summary text.`;

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
