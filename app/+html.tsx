import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

// Web-only HTML shell for Expo Router's static export (ignored on native).
//
// Without this, Expo emits a default document with a white body and no
// `theme-color`, so the notch / status-bar region — and any overscroll — render
// white on mobile browsers and installed PWAs, flashing against the app's night
// ground (#060B13). We pin the whole document to night and opt into
// `viewport-fit=cover` so `env(safe-area-inset-*)` reports real insets.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Colors the browser chrome / notch region on Android + PWAs. */}
        <meta name="theme-color" content="#060B13" />
        {/* iOS standalone (added-to-home-screen) status bar. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <ScrollViewStyleReset />
        {/* Night ground behind the safe-area insets and any overscroll. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html, body { background-color: #060B13; }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
