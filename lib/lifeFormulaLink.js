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

// Daily "log your day" task — same title-match approach, routes to the Life
// tab's dot grid (pages/life.js).
export const LIFE_LOG_TASK_TITLE = 'Log Life — Daily Entry';

// The page a special task should open instead of the generic EditModal, or
// null for an ordinary task.
export function getSpecialTaskRoute(instance) {
  if (isLifeFormulaEntryTask(instance)) return '/life-formula';
  if (instance?.title === LIFE_LOG_TASK_TITLE) return '/life';
  return null;
}
