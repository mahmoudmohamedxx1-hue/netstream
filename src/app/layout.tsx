import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/lib/lang-context";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
