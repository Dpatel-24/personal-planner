// AppNav — the ONE top nav bar shared by every top-level page. Board's own
// header (pages/index.js) was the only one of these until now; this is that
// exact header lifted into a component so Goals and the Life Formula
// dashboard render an IDENTICAL bar instead of each inventing its own
// bespoke title row — same layout, padding, border, background, and nav
// item styling, with the current section highlighted the same way Board
// already highlights its own active tab.
//
// Board/Calendar are in-page tab STATE on "/", not separate routes — so
// they're the one pair of items this component renders two different ways:
// on pages/index.js itself, `localTabs`/`activeLocalTab`/`onLocalTabChange`
// are passed and they render as the original tab buttons (calling setTab
// directly, no navigation); everywhere else (Goals, dashboard), they render
// as plain links to "/" and "/?tab=Calendar" — pages/index.js reads that
// query param on mount to land on the right tab, so the link actually works
// cross-page instead of only looking like it does.
import Link from 'next/link';
import { color, space, radius, border, font } from '@/lib/tokens';
import { heading, buttonGhost } from '@/lib/components';

export default function AppNav({
  current,
  localTabs,
  activeLocalTab,
  onLocalTabChange,
  isMobile = false,
}) {
  // Matches pages/index.js's original tabBtn exactly: font.size.md, no
  // border, accent-tinted background when active.
  const tabBtnStyle = (active) => ({
    padding: `${space[1]} ${space[3]}`,
    borderRadius: radius.md,
    border: border.none,
    cursor: 'pointer',
    fontSize: font.size.md,
    fontWeight: active ? font.weight.semibold : font.weight.medium,
    fontFamily: font.family,
    color: active ? color.navy : color.mutedText,
    background: active ? color.navySoft : 'transparent',
    textDecoration: 'none',
    display: 'inline-block',
  });

  // Matches the original "Manage tags"/"Goals"/"Life Formula" buttonGhost
  // links exactly (font.size.sm), with an active variant for Goals/Life
  // Formula on their own page — Board never had this active state since
  // those two links never pointed at Board itself.
  const utilityLinkStyle = (active) => ({
    ...buttonGhost,
    padding: `${space[1]} ${space[3]}`,
    fontSize: font.size.sm,
    textDecoration: 'none',
    ...(active ? { color: color.navy, background: color.navySoft } : {}),
  });

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: space[2],
        padding: `${space[3]} ${isMobile ? space[4] : space[6]}`,
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: color.paperV6,
        flexShrink: 0,
      }}
    >
      <div style={{ ...heading, fontSize: font.size.lg }}>Planner</div>
      <nav style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
        {localTabs ? (
          localTabs.map((t) => (
            <button key={t} type="button" style={tabBtnStyle(activeLocalTab === t)} onClick={() => onLocalTabChange(t)}>
              {t}
            </button>
          ))
        ) : (
          <>
            <Link href="/" style={tabBtnStyle(false)}>
              Board
            </Link>
            <Link href="/?tab=Calendar" style={tabBtnStyle(false)}>
              Calendar
            </Link>
          </>
        )}
        {/* Manage Tags button moved into CalendarView's TagFilterDropdown
            (bottom of that dropdown) — consolidated there since tag
            management is a tags-focused action, not a nav-level one. Same
            TagManagerModal, same trigger semantics, just relocated; no
            header entry point anymore. */}
        <Link href="/goals" style={utilityLinkStyle(current === 'goals')}>
          Goals
        </Link>
        <Link href="/dashboard" style={utilityLinkStyle(current === 'dashboard')}>
          Life Formula
        </Link>
        <Link href="/life" style={utilityLinkStyle(current === 'life')}>
          Life
        </Link>
        <Link href="/books" style={utilityLinkStyle(current === 'books')}>
          Books
        </Link>
      </nav>
    </header>
  );
}
