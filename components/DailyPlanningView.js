// DailyPlanningView — Step 4 (entry point) / Step 5 (full screen) of the
// Focus Mode/Daily Planning build. Step 4 lands this as a minimal stub
// (header + close) purely so the "Daily Planning opens correctly" verify
// point is checkable on its own before Step 5 fills in the real two-pane
// content — Step 5's own commit replaces this file's body, not its
// existence/wiring into WeekBoardView.
import { space, font, color } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';

export default function DailyPlanningView({ onClose }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.inkV6 }}>
          Daily Planning
        </div>
        <button type="button" style={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
      <div style={textMuted}>Coming in Step 5.</div>
    </div>
  );
}
