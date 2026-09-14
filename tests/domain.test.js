import test from 'node:test';
import assert from 'node:assert/strict';
import { Mastery, recommendedConcepts, updateMastery, validateGeneratedCourse } from '../src/domain.js';

test('une suite de réponses met à jour une maîtrise sans valider au premier essai', () => {
  let progress = { masteryLevel: Mastery.new, correctAnswers: 0, incorrectAnswers: 0 };
  progress = updateMastery(progress, true);
  assert.equal(progress.masteryLevel, Mastery.learning);
  for (let i = 0; i < 3; i++) progress = updateMastery(progress, true);
  assert.equal(progress.masteryLevel, Mastery.mastered);
  assert.ok(progress.nextReviewAt);
});
test('une notion récemment ratée est prioritaire dans la révision', () => {
  const chosen = recommendedConcepts([{ conceptName:'A', masteryLevel:Mastery.mastered, nextReviewAt:'2020-01-01' }, { conceptName:'B', masteryLevel:Mastery.fragile, nextReviewAt:'2030-01-01' }]);
  assert.equal(chosen[0].conceptName, 'B');
});
test('la validation refuse une réponse IA sans structure de cours', () => {
  assert.throws(() => validateGeneratedCourse({ title:'Leçon' }));
  assert.deepEqual(validateGeneratedCourse({ title:'Leçon', sections:[{ title:'Objectif', content:'Comprendre.' }] }).sections.length, 1);
});
