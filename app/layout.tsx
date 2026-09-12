import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { ScrollArea } from "@/components/ScrollArea";
import { SkewHydrator } from "@/components/SkewHydrator";
import { TickerLongPress } from "@/components/TickerLongPress";
import { PrivacyProvider } from "@/components/privacy";
import { MarginModeProvider } from "@/components/margin-mode";
import { ThemeModeProvider } from "@/components/theme-mode";
import { ThemeToggle } from "@/components/ThemeToggle";
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

// Inter, scoped to the wide-surface pages only (/desktop, /overview); the
// phone-frame app keeps Geist unchanged.
const inter = Inter({
  variable: "--font-inter",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // /desktop and /overview are a genuinely different surface (wide sortable
  // tables, not a phone-shaped app). The pathname comes from proxy.ts, since
  // a Server Component root layout has no usePathname of its own. Every other
  // route gets the phone-frame chrome as always.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isWideSurface = pathname.startsWith("/desktop") || pathname.startsWith("/overview");

  if (isWideSurface) {
    return (
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}>
        {/* theme-light (globals.css) is the zero-JS default for this subtree;
            ThemeModeProvider swaps in theme-dark client-side per the
            light/dark/auto toggle fixed top-right. globals.css caps html/body
            at the viewport with overflow hidden, so the ScrollArea here is what
            scrolls, same as the phone frame's own inner panel. */}
        <body className="theme-light h-full bg-bg font-[family-name:var(--font-inter)]">
          <ThemeModeProvider>
            <ThemeToggle />
            <ScrollArea className="h-full w-full overflow-y-auto">
              <PrivacyProvider>
                <MarginModeProvider>
                  <TickerLongPress />
                  {DEMO_MODE && (
                    <div className="bg-amber-500/15 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/30">
                      Demo — sample portfolio, not real positions
                    </div>
                  )}
                  {children}
                </MarginModeProvider>
              </PrivacyProvider>
            </ScrollArea>
          </ThemeModeProvider>
          {DEMO_MODE && <Analytics />}
        </body>
      </html>
    );
  }

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
              {/* Hold any ticker for 2.5s anywhere in the app to open it in Lookup a Ticker. */}
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
