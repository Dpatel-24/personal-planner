// App shell: main pane with view tabs (Board / Calendar) + persistent daily
// sidebar on desktop. On mobile (<=768px, see lib/useIsMobile.js) the sidebar
// can't fit beside main content (it's 340px wide on its own), so it becomes a
// third "Today" tab instead — same DailySidebar component, just relocated.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { color, space, radius, border, font } from '@/lib/tokens';
import { heading, buttonGhost } from '@/lib/components';
import DailySidebar from '@/components/DailySidebar';
import WeekBoardView from '@/components/WeekBoardView';
import CalendarView from '@/components/CalendarView';
import TagManagerModal from '@/components/TagManagerModal';
import TimerBar from '@/components/TimerBar';
import { RefreshProvider } from '@/components/RefreshContext';
import { TimerProvider } from '@/components/TimerContext';
import { useIsMobile } from '@/lib/useIsMobile';

export default function Home() {
  const [tab, setTab] = useState('Board');
  const [managingTags, setManagingTags] = useState(false);
  const isMobile = useIsMobile();
  const tabs = isMobile ? ['Board', 'Calendar', 'Today'] : ['Board', 'Calendar'];

  // If the window grows past the breakpoint while "Today" is active, that tab
  // no longer exists (desktop shows the sidebar instead) — fall back to Board.
  useEffect(() => {
    if (!isMobile && tab === 'Today') setTab('Board');
  }, [isMobile, tab]);

  const tabBtn = (active) => ({
    padding: `${space[1]} ${space[3]}`,
    borderRadius: radius.md,
    border: border.none,
    cursor: 'pointer',
    fontSize: font.size.md,
    fontWeight: active ? font.weight.semibold : font.weight.medium,
    fontFamily: font.family,
    color: active ? color.accent : color.textMuted,
    background: active ? color.accentSubtle : 'transparent',
  });

  return (
    <RefreshProvider>
      <TimerProvider>
        <Head>
          <title>Planner</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <main
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: space[2],
                padding: `${space[3]} ${isMobile ? space[4] : space[6]}`,
                borderBottom: border.default,
                background: color.bg,
                flexShrink: 0,
              }}
            >
              <div style={{ ...heading, fontSize: font.size.lg }}>Planner</div>
              <nav style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
                {tabs.map((t) => (
                  <button key={t} style={tabBtn(tab === t)} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }}
                  onClick={() => setManagingTags(true)}
                >
                  Manage tags
                </button>
              </nav>
            </header>

            {/* Outside WeekBoardView/CalendarView on purpose — this stays
                mounted across tab switches, so a running timer keeps
                counting and stays visible no matter which view is active. */}
            <TimerBar />

            <section
              style={{
                flex: 1,
                minHeight: 0,
                padding: isMobile ? space[3] : space[6],
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {tab === 'Board' && <WeekBoardView />}
              {tab === 'Calendar' && <CalendarView />}
              {tab === 'Today' && isMobile && <DailySidebar />}
            </section>
          </main>

          {!isMobile && (
            <aside
              style={{
                width: 340,
                flexShrink: 0,
                borderLeft: border.default,
                background: color.bg,
              }}
            >
              <DailySidebar />
            </aside>
          )}
        </div>

        {managingTags && <TagManagerModal onClose={() => setManagingTags(false)} />}
      </TimerProvider>
    </RefreshProvider>
  );
}
