// TagAssignSection — two small, independent tag pickers wrapping TagPicker's
// select+inline-create UI, each writing immediately (not gated behind the
// modal's Save button), same pattern as ChecklistSection/
// ChecklistTemplateSection. InstanceTagSection sets ONE instance's own
// tag_id directly (lib/tag-queries.js setInstanceTag) — never touches the
// template or any sibling instance. TemplateDefaultTagSection sets the
// template's default_tag_id (setTemplateDefaultTag) — only affects instances
// generated AFTER this call, never retroactive (see lib/recurrence.js).
import { useState } from 'react';
import TagPicker from './TagPicker';
import { setInstanceTag, setTemplateDefaultTag } from '@/lib/tag-queries';
import { color, space, font } from '@/lib/tokens';
import { textMuted } from '@/lib/components';
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

export function TemplateDefaultTagSection({ templateId, initialTagId }) {
  const [tagId, setTagId] = useState(initialTagId ?? null);
  const [error, setError] = useState(null);

  const change = async (nextTagId) => {
    setTagId(nextTagId);
    try {
      await setTemplateDefaultTag(templateId, nextTagId);
      // Deliberately no refresh() here — this never changes any
      // already-generated instance, so there's nothing on screen to update.
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{ ...textMuted, marginBottom: space[1] }}>
        Editing this never changes already-generated occurrences.
      </div>
      <TagPicker value={tagId} onChange={change} label="Default tag (future occurrences)" />
      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1] }}>{error}</div>}
    </div>
  );
}
