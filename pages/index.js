// App shell: main pane with view tabs (Board / Calendar) + persistent daily
// sidebar.
import Head from 'next/head';
import { useState } from 'react';
import { color, space, radius, border, font } from '@/lib/tokens';
import { heading } from '@/lib/components';
import DailySidebar from '@/components/DailySidebar';
import BoardView from '@/components/BoardView';
import CalendarView from '@/components/CalendarView';
import { RefreshProvider } from '@/components/RefreshContext';

const TABS = ['Board', 'Calendar'];

export default function Home() {
  const [tab, setTab] = useState('Board');

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
      <Head>
        <title>Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${space[3]} ${space[6]}`,
              borderBottom: border.default,
              background: color.bg,
            }}
          >
            <div style={{ ...heading, fontSize: font.size.lg }}>Planner</div>
            <nav style={{ display: 'flex', gap: space[1] }}>
              {TABS.map((t) => (
                <button key={t} style={tabBtn(tab === t)} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </nav>
          </header>
          <section style={{ flex: 1, padding: space[6] }}>
            {tab === 'Board' ? <BoardView /> : <CalendarView />}
          </section>
        </main>

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
      </div>
    </RefreshProvider>
  );
}
