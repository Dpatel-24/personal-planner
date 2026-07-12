// App shell: main pane with view tabs (Board / Calendar) + persistent daily
// sidebar. Board and Calendar are placeholders until 2f proper.
import Head from 'next/head';
import { useState } from 'react';
import { color, space, radius, border, font } from '@/lib/tokens';
import { card, heading, textMuted } from '@/lib/components';
import DailySidebar from '@/components/DailySidebar';
import BoardView from '@/components/BoardView';

const TABS = ['Board', 'Calendar'];

function PlaceholderView({ name }) {
  return (
    <div style={{ ...card, maxWidth: 520 }}>
      <div style={heading}>{name}</div>
      <p style={{ ...textMuted, marginTop: space[2], marginBottom: 0 }}>
        This view is coming next. The daily list on the right is live — add a
        task, check it off, or skip it, and it persists to the database.
      </p>
    </div>
  );
}

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
    <>
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
            {tab === 'Board' ? <BoardView /> : <PlaceholderView name={tab} />}
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
    </>
  );
}
