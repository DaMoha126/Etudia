export const Mastery = Object.freeze({ new: 'Découverte', learning: 'En apprentissage', fragile: 'Fragile', mastered: 'Maîtrisée' });

export function createId(prefix = 'item') { return `${prefix}_${crypto.randomUUID()}`; }
export function nowIso() { return new Date().toISOString(); }

export function updateMastery(progress, correct) {
  const next = { ...progress, correctAnswers: progress.correctAnswers || 0, incorrectAnswers: progress.incorrectAnswers || 0 };
  correct ? next.correctAnswers++ : next.incorrectAnswers++;
  const total = next.correctAnswers + next.incorrectAnswers;
  const rate = next.correctAnswers / total;
  next.masteryLevel = total < 2 ? Mastery.learning : rate < .55 ? Mastery.fragile : rate >= .8 && total >= 4 ? Mastery.mastered : Mastery.learning;
  next.lastReviewedAt = nowIso();
  next.nextReviewAt = new Date(Date.now() + (next.masteryLevel === Mastery.fragile ? 864e5 : 3 * 864e5)).toISOString();
  return next;
}

export function recommendedConcepts(progresses, limit = 4) {
  return [...progresses].sort((a, b) => {
    const rank = (p) => p.masteryLevel === Mastery.fragile ? 0 : p.nextReviewAt && new Date(p.nextReviewAt) <= new Date() ? 1 : 2;
    return rank(a) - rank(b) || new Date(a.nextReviewAt || 0) - new Date(b.nextReviewAt || 0);
  }).slice(0, limit);
}

export function validateGeneratedCourse(value) {
  if (!value || typeof value !== 'object' || !value.title || !Array.isArray(value.sections)) throw new Error('Réponse de génération invalide. Réessaie plus tard.');
  return { ...value, sections: value.sections.filter(s => s && s.title && s.content) };
}
