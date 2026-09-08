import { validateGeneratedCourse } from './domain.js';

function baseUrl() { return window.ETUDIA_API_URL || ''; }
async function request(path, body) {
  if (!baseUrl()) throw new Error('Cette fonction nécessite la connexion au serveur Étudia. Configure ETUDIA_API_URL sans jamais ajouter de clé IA dans l’application.');
  let response;
  try { response = await fetch(`${baseUrl()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Connexion impossible. Vérifie internet puis réessaie.'); }
  if (response.status === 429) throw new Error('Le quota de génération est atteint. Réessaie plus tard.');
  if (!response.ok) throw new Error('Le serveur n’a pas pu traiter la demande. Réessaie plus tard.');
  try { return await response.json(); } catch { throw new Error('Réponse serveur invalide. Réessaie plus tard.'); }
}
export const aiService = {
  async generateCourse(input) { return validateGeneratedCourse(await request('/v1/ai/generate-course', input)); },
  async answerQuestion(input) { const r = await request('/v1/ai/answer', input); if (!r.answer) throw new Error('Réponse IA invalide.'); return r.answer; },
  async analyzeCourse(input) { return validateGeneratedCourse(await request('/v1/ai/analyze-course', input)); },
};
export const ocrService = {
  async extract(pages) { const r = await request('/v1/ocr/extract', { pages }); if (!r.text?.trim()) throw new Error('Impossible de lire cette photo. Essaie avec une photo plus nette et mieux éclairée.'); return r.text; },
};
