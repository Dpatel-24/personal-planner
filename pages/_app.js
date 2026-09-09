import "@/styles/globals.css";
import { Inter } from "next/font/google";

// next/font/google self-hosts the font (no external CDN request, no CLS).
// _document.js can't use next/font on this Next version (confirmed via a
// real build error, not assumed) — _app.js is the supported location for
// Pages Router. `variable` exposes it as a CSS custom property on this
// wrapper div, in scope for every page's content (100% of it renders
// inside <Component>) and every inline style built from lib/tokens.js's
// font.family, which references var(--font-inter) directly. The wrapper
// div itself carries no layout styles, so it's inert for every page's own
// height:100vh root container.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function App({ Component, pageProps }) {
  return (
    <div
      className={inter.variable}
      // Safe-area padding (2026-09, "make app launch standalone on iOS"):
      // apple-mobile-web-app-status-bar-style is "black-translucent"
      // (pages/_document.js), which lets content render UNDER the iPhone
      // notch/status bar in standalone PWA mode — env() resolves to 0 in
      // every other context (desktop, a plain Safari tab, Android), so
      // this is a no-op everywhere except actually-installed iOS, where
      // it's exactly what keeps each page's own top nav/header clear of
      // the notch. Lives here (the one wrapper every page already renders
      // inside) rather than in all 7 individual page files, and needs
      // viewport-fit=cover in each page's own <meta name="viewport"> to
      // actually resolve to a nonzero value per the CSS env() spec — see
      // that meta tag's own updated content.
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Component {...pageProps} />
    </div>
  );
}
