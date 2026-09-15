import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { ScrollArea } from "@/components/ScrollArea";
import { SkewHydrator } from "@/components/SkewHydrator";
import { TickerLongPress } from "@/components/TickerLongPress";
import { PrivacyProvider } from "@/components/privacy";
import { MarginModeProvider } from "@/components/margin-mode";
import { DEMO_MODE } from "@/lib/demo";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Personal options & equity portfolio cockpit",
  applicationName: "Portfolio",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Portfolio" },
  icons: { apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full sm:flex sm:min-h-screen sm:items-center sm:justify-center sm:bg-neutral-900 sm:py-6">
        {/* On every viewport the shell is a full-height flex column: the middle
            scrolls internally and the BottomNav is the bottom row, so the document
            itself never scrolls. That's what stops the mobile toolbar from collapsing
            and floating the fixed nav. Desktop additionally frames it like a phone. */}
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-bg sm:h-[860px] sm:max-h-[calc(100dvh-3rem)] sm:w-[400px] sm:rounded-[2.75rem] sm:border-[6px] sm:border-neutral-800 sm:shadow-2xl sm:shadow-black/60">
          <PrivacyProvider>
            <MarginModeProvider>
              <SkewHydrator />
              {/* Hold any ticker for 1.8s anywhere in the app to open it in Chart a Ticker. */}
              <TickerLongPress />
              {/* A public demo shows invented numbers, so say so plainly — with the
                  Example toggle hidden there's otherwise nothing marking it. */}
              {DEMO_MODE && (
                <div className="shrink-0 bg-amber-500/15 px-4 py-1.5 text-center text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/30">
                  Demo — sample portfolio, not real positions
                </div>
              )}
              <ScrollArea className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto pb-[calc(4.75rem_+_env(safe-area-inset-bottom))] sm:pb-6">{children}</ScrollArea>
              <BottomNav />
              {/* Visitor counts for the public demo only. A self-hosted instance is
                  someone's private trading dashboard — it shouldn't report anywhere. */}
              {DEMO_MODE && <Analytics />}
            </MarginModeProvider>
          </PrivacyProvider>
        </div>
      </body>
    </html>
  );
}
