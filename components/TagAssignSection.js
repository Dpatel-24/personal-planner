// TagAssignSection — InstanceTagSection wraps TagPicker's select+inline-
// create UI, writing immediately (not gated behind the modal's Save
// button), same pattern as ChecklistSection. Sets ONE instance's own tag_id
// directly (lib/tag-queries.js setInstanceTag) — never touches the template
// or any sibling instance on its own. For a recurring task, choosing "All
// occurrences" in EditModal's own Save is what pushes this instance's
// CURRENT tag_id out to the template and every eligible sibling (see
// lib/data.js's updateTemplateAll) — there is no separate template-level
// tag picker anymore (2026-08 redesign; the old TemplateDefaultTagSection
// here was silently non-retroactive, which read as a bug from the outside).
import { useState } from 'react';
import TagPicker from './TagPicker';
import { setInstanceTag } from '@/lib/tag-queries';
import { color, space, font } from '@/lib/tokens';
import { useRefresh } from './RefreshContext';

export function InstanceTagSection({ instanceId, initialTagId }) {
  const { refresh } = useRefresh();
  const [tagId, setTagId] = useState(initialTagId ?? null);
  const [error, setError] = useState(null);

  const change = async (nextTagId) => {
    setTagId(nextTagId);
    try {
      await setInstanceTag(instanceId, nextTagId);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <TagPicker value={tagId} onChange={change} label="Tag" />
      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1] }}>{error}</div>}
    </div>
  );
}
