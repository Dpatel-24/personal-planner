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
    <div className={inter.variable}>
      <Component {...pageProps} />
    </div>
  );
}
