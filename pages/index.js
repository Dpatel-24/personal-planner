// App shell: main pane with view tabs (Board / Calendar) + persistent daily
// sidebar on desktop. On mobile (<=768px, see lib/useIsMobile.js) the sidebar
// can't fit beside main content (it's 340px wide on its own), so it becomes a
// third "Today" tab instead — same DailySidebar component, just relocated.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { color, space, border } from '@/lib/tokens';
import AppNav from '@/components/AppNav';
import ScheduleRail from '@/components/ScheduleRail';
import WeekBoardView from '@/components/WeekBoardView';
import CalendarView from '@/components/CalendarView';
import TagManagerModal from '@/components/TagManagerModal';
import TimerBar from '@/components/TimerBar';
import { RefreshProvider } from '@/components/RefreshContext';
import { TimerProvider } from '@/components/TimerContext';
import { useIsMobile } from '@/lib/useIsMobile';

export default function Home() {
  const [tab, setTab] = useState('Today');
  const [managingTags, setManagingTags] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();
  const tabs = isMobile ? ['Today', 'Board', 'Calendar'] : ['Board', 'Calendar'];

  // If the window grows past the breakpoint while "Today" is active, that tab
  // no longer exists (desktop shows the sidebar instead) — fall back to Board.
  useEffect(() => {
    if (!isMobile && tab === 'Today') setTab('Board');
  }, [isMobile, tab]);

  // AppNav's Calendar link from Goals/dashboard points at "/?tab=Calendar"
  // since Board/Calendar are in-page state here, not separate routes — this
  // is what makes that link actually land on Calendar instead of just
  // navigating "back to Board" like every other pre-existing Link to "/".
  // router.isReady guards against reading query before Next has parsed it.
  useEffect(() => {
    if (router.isReady && router.query.tab === 'Calendar') setTab('Calendar');
  }, [router.isReady, router.query.tab]);

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
            <AppNav
              current="board"
              localTabs={tabs}
              activeLocalTab={tab}
              onLocalTabChange={setTab}
              onManageTags={() => setManagingTags(true)}
              isMobile={isMobile}
            />

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
              {/* Schedule Rail V5: the Today sidebar/tab IS the rail on
                  both platforms now — no separate plain task-list view and
                  no separate third rail column beside the sidebar. Rail is
                  always standalone (owns its own header/add-task form/
                  recurring button) since nothing else provides those
                  anymore. */}
              {tab === 'Today' && isMobile && <ScheduleRail standalone />}
            </section>
          </main>

          {/* Desktop: the Today sidebar itself IS the rail (standalone) —
              not a separate companion column beside a plain-list sidebar
              anymore. Same component, same "standalone" mode mobile's
              Today tab already uses above. */}
          {!isMobile && (
            <aside
              style={{
                width: 340,
                flexShrink: 0,
                borderLeft: border.default,
                background: color.bg,
              }}
            >
              <ScheduleRail standalone />
            </aside>
          )}
        </div>

        {managingTags && <TagManagerModal onClose={() => setManagingTags(false)} />}
      </TimerProvider>
    </RefreshProvider>
  );
}
