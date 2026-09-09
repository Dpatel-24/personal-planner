import { Html, Head, Main, NextScript } from "next/document";

// _document.js renders ONCE for the whole app (unlike each page's own
// next/head <Head>, which re-runs per page/navigation) — the right place
// for tags that must be present on every route without repeating them in
// all 7 page files: the PWA manifest link and iOS's own home-screen meta
// tags (2026-09, "make app launch standalone on iOS"). iOS doesn't honor
// the web manifest spec on its own; apple-mobile-web-app-capable is what
// actually makes "Add to Home Screen" launch full-screen with no Safari
// chrome, status-bar-style/apple-touch-icon are iOS-specific companions to
// it. "OS" matches the app's own in-nav brand name (components/AppNav.js).
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1F3A5F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OS" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
