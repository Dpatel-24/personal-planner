// lifeFormula.js — pure function computing the weekly "life formula" score
// and state band for a personal-planner/lib/goals-queries.js sibling feature
// (life_formula_entries table, see its migration). Deliberately has zero
// Supabase/React dependencies: given the 9 scored inputs it returns
// { score, state } and nothing else, so the caller decides when/whether to
// persist it (score/state are computed and stored at insert time — see the
// life_formula_entries schema — not recalculated on read).
//
// Formula (verified against 5 known input/output pairs before this file was
// written — see the commit message):
//   score = (((vision + systems + resilience + persistence) / 4)
//             + lessons_integrated)
//           / (financial_friction + emotional_turbulence + coordination_friction)
//           * (execution / 5)

const STATE_FRICTION = 'Friction';
const STATE_STABILITY = 'Stability';
const STATE_MOMENTUM = 'Momentum';

function classifyState(score) {
  if (score < 1.0) return STATE_FRICTION;
  if (score < 2.0) return STATE_STABILITY;
  return STATE_MOMENTUM;
}

// Rounded to 4 decimal places — every known-good expected value in the spec
// has at most 4 decimal digits (0.8625, 1.0125, ...), and floating-point
// division otherwise leaves dust (e.g. 0.8624999999999999) that would fail
// an exact-match comparison against the spec's numbers despite being
// mathematically identical.
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function calculateLifeFormula({
  vision,
  systems,
  resilience,
  persistence,
  lessons_integrated,
  financial_friction,
  emotional_turbulence,
  coordination_friction,
  execution,
}) {
  const denominator = financial_friction + emotional_turbulence + coordination_friction;

  // Valid 1-5 inputs make this impossible (minimum possible denominator is
  // 1+1+1=3), but guard anyway per the ask: a caller passing 0, null, or
  // otherwise out-of-spec values should get a clear failure, not a silent
  // NaN/Infinity leaking into a stored score.
  if (denominator === 0) {
    throw new Error(
      'calculateLifeFormula: financial_friction + emotional_turbulence + coordination_friction is 0 ' +
        '— cannot divide by zero. Check that all three inputs are valid 1-5 scores.'
    );
  }

  const numerator = (vision + systems + resilience + persistence) / 4 + lessons_integrated;
  const score = round4((numerator / denominator) * (execution / 5));

  return { score, state: classifyState(score) };
}
