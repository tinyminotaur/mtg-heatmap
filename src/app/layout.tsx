import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { ManaFontPreload } from "@/components/mana-font-preload";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

/** Empty string env bypasses `??` and breaks `new URL("")` → 500 on every page. */
function safeMetadataBase(): URL {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim();
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: {
    default: "MTG Heatmap",
    template: "%s · MTG Heatmap",
  },
  description:
    "Chronological printings × live-ish Scryfall prices, collection, and watchlists — Alpha through Saviors-era POC.",
  openGraph: {
    title: "MTG Heatmap",
    description: "Compare printings, prices, and your collection across editions.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrains.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <ManaFontPreload />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
