import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "./providers";
import { AmbientWave } from "@/components/motion/AmbientWave";
import { ScrollToTop } from "@/components/ScrollToTop";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cadence // payments that stream",
  description:
    "Payments that move every second. Deposit USDC once, the people you pay earn in real time on Arc and cash out whenever they feel like it.",
  icons: { icon: "/logo.svg", shortcut: "/logo.svg" },
  openGraph: {
    title: "Cadence // payments that stream",
    description:
      "Deposit once. The people you pay earn by the second on Arc. Withdraw anytime, settles in about 350ms.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141316" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Runs before first paint to set the `.dark` class from the saved choice, or
// the system preference when the user hasn't picked one. Inlined so there is no
// flash of the wrong theme on load. Kept in sync with ThemeProvider's seeding.
const themeScript = `(function(){try{var s=localStorage.getItem("theme");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <AmbientWave />
        <Providers>{children}</Providers>
        <ScrollToTop />
      </body>
    </html>
  );
}
