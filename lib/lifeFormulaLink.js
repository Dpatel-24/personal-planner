// lifeFormulaLink.js — identifies the recurring "Life Formula weekly entry"
// task so board/calendar/sidebar click handlers can route straight to the
// entry form (pages/life-formula.js) instead of opening the generic
// EditModal. Matched by exact title — the one stable, human-visible
// identifier every resolved instance already carries, so this needs no
// schema change (no new task_templates/task_instances column) just to link
// one specific recurring series to a specific page. If this ever needs to
// generalize to more than one special-routed task, that's the signal to add
// a real column — not a reason to invent one now for a single case.
export const LIFE_FORMULA_TASK_TITLE = 'Life Formula — Weekly Entry';

export function isLifeFormulaEntryTask(instance) {
  return instance?.title === LIFE_FORMULA_TASK_TITLE;
}
