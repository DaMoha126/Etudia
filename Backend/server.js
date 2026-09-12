import { createServer } from 'node:http';

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const APP_ACCESS_KEY = process.env.APP_ACCESS_KEY;

if (!GEMINI_API_KEY) {
  console.error('⚠️  GEMINI_API_KEY manquante. Ajoute-la dans les variables d\'environnement avant de démarrer.');
}
if (!APP_ACCESS_KEY) {
  console.error('⚠️  APP_ACCESS_KEY manquante. Sans elle, le serveur reste ouvert à n\'importe qui.');
}

// --- petits utilitaires HTTP ---

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject({ status: 400, message: 'Corps de requête JSON invalide.' }); }
    });
    req.on('error', reject);
  });
}

// --- appel Gemini ---

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(parts, { wantJson = false } = {}) {
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts }],
    ...(wantJson ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  });

  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    } catch {
      throw { status: 502, message: 'Impossible de contacter le service IA. Réessaie plus tard.' };
    }
    if (response.status === 503 && attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
    break;
  }
  if (response.status === 429) throw { status: 429, message: 'Quota Gemini atteint pour le moment. Réessaie plus tard.' };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw { status: 502, message: `Erreur Gemini (${response.status}) : ${text.slice(0, 200)}` };
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw { status: 502, message: 'Réponse vide du service IA.' };
  return text;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); } catch { return null; }
}

function validateCourseShape(value) {
  if (!value || typeof value !== 'object' || !value.title || !Array.isArray(value.sections)) return null;
  const sections = value.sections
    .filter((s) => s && s.title && s.content)
    .map((s) => ({ title: String(s.title), content: String(s.content) }));
  if (!sections.length) return null;
  const concepts = Array.isArray(value.concepts)
    ? value.concepts.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
    : [];
  return { title: String(value.title), sections, concepts };
}

function validateQuizShape(value) {
  if (!value || !Array.isArray(value.items)) return null;
  const items = value.items.filter((it) => {
    if (!it || !it.type || !it.concept) return false;
    if (it.type === 'flashcard') return !!it.front && !!it.back;
    if (it.type === 'question') return !!it.prompt && Array.isArray(it.options) && it.options.length >= 2 && Number.isInteger(it.correctIndex) && it.correctIndex >= 0 && it.correctIndex < it.options.length;
    if (it.type === 'exercise') return !!it.prompt;
    return false;
  });
  if (!items.length) return null;
  return { items };
}

// --- routes, une par endpoint attendu par src/services.js ---

const routes = {
  '/v1/ai/generate-course': async (body) => {
    const { title, subject, schoolLevel, difficulty, language = 'fr', objective } = body;
    if (!title) throw { status: 400, message: 'title manquant.' };
    const prompt = `Tu es un professeur qui crée une fiche de cours structurée en ${language}.
Sujet du cours : "${title}"
Matière : ${subject || 'non précisée'}
Niveau scolaire : ${schoolLevel || 'non précisé'}
Difficulté souhaitée : ${difficulty || 'moyenne'}
Objectif pédagogique : ${objective || 'Comprendre puis s’entraîner progressivement.'}

Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour, sans balises markdown :
{"title": "titre du cours", "sections": [{"title": "titre de section", "content": "contenu pédagogique clair et complet de la section"}], "concepts": ["notion clé 1", "notion clé 2"]}
Crée entre 3 et 6 sections qui couvrent le sujet de façon progressive (définitions, explications, exemples, points de vigilance). Ajoute aussi 3 à 6 notions clés courtes (le champ concepts) que l'élève doit retenir, utiles pour générer plus tard des révisions.`;
    const text = await callGemini([{ text: prompt }], { wantJson: true });
    const course = validateCourseShape(extractJson(text));
    if (!course) throw { status: 502, message: 'Réponse IA invalide, réessaie.' };
    return course;
  },

  '/v1/ai/analyze-course': async (body) => {
    const { title, subject, schoolLevel, originalContent, language = 'fr' } = body;
    if (!originalContent) throw { status: 400, message: 'originalContent manquant.' };
    const prompt = `Tu es un professeur qui transforme des notes scannées en fiche de cours structurée, en ${language}.
Titre donné par l'élève : "${title || 'Sans titre'}"
Matière : ${subject || 'non précisée'}
Niveau scolaire : ${schoolLevel || 'non précisé'}

Voici le texte brut extrait par OCR des notes de l'élève (peut contenir des erreurs de lecture évidentes à corriger) :
"""
${originalContent}
"""

Réorganise ce contenu en une fiche de cours claire, fidèle aux notes originales. Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour, sans balises markdown :
{"title": "titre du cours", "sections": [{"title": "titre de section", "content": "contenu pédagogique clair"}], "concepts": ["notion clé 1", "notion clé 2"]}
Ajoute aussi 3 à 6 notions clés courtes (le champ concepts) que l'élève doit retenir, utiles pour générer plus tard des révisions.`;
    const text = await callGemini([{ text: prompt }], { wantJson: true });
    const course = validateCourseShape(extractJson(text));
    if (!course) throw { status: 502, message: 'Réponse IA invalide, réessaie.' };
    return course;
  },

  '/v1/ai/generate-quiz': async (body) => {
    const { courseTitle, courseContent, concepts } = body;
    if (!Array.isArray(concepts) || !concepts.length) throw { status: 400, message: 'concepts manquants.' };
    const sectionsText = Array.isArray(courseContent?.sections)
      ? courseContent.sections.map((s) => `${s.title} : ${s.content}`).join('\n')
      : JSON.stringify(courseContent || '').slice(0, 4000);
    const prompt = `Tu es un professeur qui crée des activités de révision variées en français, à partir d'un cours déjà rédigé.
Titre du cours : "${courseTitle || 'Sans titre'}"
Contenu du cours :
"""
${sectionsText.slice(0, 6000)}
"""
Notions à travailler en priorité : ${concepts.join(', ')}

Pour chacune de ces notions, crée une flashcard (question courte au recto, réponse au verso) et une question à choix multiple (4 options, une seule correcte, avec une explication de la bonne réponse). Ajoute aussi un seul exercice global qui combine plusieurs de ces notions, avec un indice et une solution modèle rédigée.

Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour, sans balises markdown :
{"items": [
  {"type": "flashcard", "concept": "nom de la notion", "front": "question courte", "back": "réponse"},
  {"type": "question", "concept": "nom de la notion", "prompt": "énoncé", "options": ["option A", "option B", "option C", "option D"], "correctIndex": 0, "explanation": "pourquoi c'est la bonne réponse"},
  {"type": "exercise", "concept": "nom de la notion", "prompt": "énoncé de l'exercice", "hint": "indice", "solution": "solution rédigée"}
]}`;
    const text = await callGemini([{ text: prompt }], { wantJson: true });
    const quiz = validateQuizShape(extractJson(text));
    if (!quiz) throw { status: 502, message: 'Réponse de quiz invalide, réessaie.' };
    return quiz;
  },

  '/v1/ai/answer': async (body) => {
    const { courseTitle, courseContent, question, pedagogy } = body;
    if (!question) throw { status: 400, message: 'question manquante.' };
    const prompt = `${pedagogy || 'Guide l’élève avec un indice, la méthode, puis une explication.'}
Cours concerné : "${courseTitle || 'Sans titre'}"
Contenu du cours : ${JSON.stringify(courseContent || '').slice(0, 4000)}
Question de l'élève : "${question}"
Réponds en français, de façon claire et pédagogique, sans donner directement une réponse d'exercice si ce n'en est pas explicitement une.`;
    const text = await callGemini([{ text: prompt }]);
    return { answer: text.trim() };
  },

  '/v1/ocr/extract': async (body) => {
    const { pages } = body;
    if (!Array.isArray(pages) || !pages.length) throw { status: 400, message: 'pages manquantes.' };
    const parts = [{ text: 'Retranscris fidèlement tout le texte visible sur ces photos de notes manuscrites ou imprimées, dans l’ordre des pages. Ne commente pas, ne résume pas : renvoie uniquement le texte brut retranscrit.' }];
    for (const page of pages) {
      const match = /^data:(.+);base64,(.+)$/.exec(page?.data || '');
      if (!match) continue;
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    if (parts.length === 1) throw { status: 400, message: 'Aucune photo valide reçue.' };
    const text = await callGemini(parts);
    return { text: text.trim() };
  },
};

// --- serveur ---

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Etudia-Key',
    });
    return res.end();
  }

  const handler = req.method === 'POST' ? routes[req.url] : null;
  if (!handler) return sendJson(res, 404, { error: 'Route inconnue.' });

  if (!GEMINI_API_KEY) return sendJson(res, 500, { error: 'Serveur mal configuré : GEMINI_API_KEY manquante.' });
  if (APP_ACCESS_KEY && req.headers['x-etudia-key'] !== APP_ACCESS_KEY) {
    return sendJson(res, 401, { error: 'Accès non autorisé.' });
  }

  try {
    const body = await readBody(req);
    const result = await handler(body);
    sendJson(res, 200, result);
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error(err);
    sendJson(res, status, { error: err?.message || 'Erreur serveur.' });
  }
});

server.listen(PORT, () => console.log(`Étudia backend en écoute sur le port ${PORT} (modèle : ${GEMINI_MODEL})`));
