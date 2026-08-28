// pinnedSort.js — the one shared sort rule for pinned tasks (Morning Chain /
// Evening Winddown, and any future task with pinned_position set).
// pinned_position='first' always sorts to the front of a day's list,
// 'last' always to the back, everything else keeps its existing relative
// order in between — regardless of stored position/sort_order. Used
// everywhere a day's tasks are listed (board columns, Focus mode's
// DayAgendaRail, Daily Planning) so the rule lives in exactly one place,
// not re-implemented per view.
export function sortWithPins(instances) {
  const first = instances.filter((i) => i.pinned_position === 'first');
  const middle = instances.filter((i) => !i.pinned_position);
  const last = instances.filter((i) => i.pinned_position === 'last');
  return [...first, ...middle, ...last];
}
