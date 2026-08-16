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
  title: "NetStream — Watch Movies & Series",
  description:
    "Stream movies and series by IMDB ID through the vidsrc player. A Netflix-inspired streaming experience.",
  keywords: [
    "streaming",
    "movies",
    "series",
    "vidsrc",
    "imdb",
    "watch online",
  ],
  authors: [{ name: "NetStream" }],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NetStream — Watch Movies & Series",
    description:
      "Stream movies and series by IMDB ID through the vidsrc player.",
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
