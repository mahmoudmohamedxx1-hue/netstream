import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/lib/lang-context";
import { PWARegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetStream — Watch Movies & Series Free in HD",
  description:
    "Watch movies and TV series free in HD. 24+ streaming sources, no registration required. Netflix-inspired streaming experience with trending titles, top IMDB picks, and Arabic content.",
  keywords: [
    "streaming",
    "movies",
    "series",
    "watch online",
    "free movies",
    "hd streaming",
    "netstream",
    "imdb",
    "tv shows",
  ],
  authors: [{ name: "NetStream" }],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NetStream — Watch Movies & Series Free in HD",
    description:
      "Watch movies and TV series free in HD. 24+ streaming sources, no registration required.",
    siteName: "NetStream",
    type: "website",
  },
  // PWA — discoverable via /manifest.json (name, icons, standalone display,
  // shortcuts). Installability needs the manifest + the service worker that
  // src/components/pwa-register.tsx registers.
  manifest: "/manifest.json",
  // iOS Safari doesn't read the manifest for install — it needs these meta
  // tags (Next maps them to <meta name="apple-mobile-web-app-*">).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NetStream",
  },
};

// Browser-chrome + OS-level dark theming: paints the UI chrome (address bar
// on mobile, title bar on desktop installs) in the app's near-black instead
// of blinding white, and tells the browser this page is dark-rendered (no
// white flash before hydration).
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  // maximumScale 5 allows user zoom (never disable — a11y) while preventing
  // layout breakage on TV browsers. viewportFit cover supports notched phones.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* NOTE: no manual <meta name="viewport"> here — Next generates it
            from the `viewport` export above. A manual meta alongside the
            export produced TWO viewport tags in the DOM. */}
        {/* iOS standalone install support. Next's appleWebApp metadata emits
            the modern `mobile-web-app-capable` alias; older iOS Safari (≤16)
            only honors the classic `apple-mobile-web-app-capable` spelling. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <LanguageProvider>
          {children}
          <Toaster />
          <PWARegister />
        </LanguageProvider>
      </body>
    </html>
  );
}
