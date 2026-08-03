import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "./providers";
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
  title: "Cadence // salary that streams",
  description:
    "Payroll that moves every second. Deposit USDC once, your team earns in real time on Arc and cashes out whenever they feel like it.",
  icons: { icon: "/logo.svg", shortcut: "/logo.svg" },
  openGraph: {
    title: "Cadence // salary that streams",
    description:
      "Deposit once. Your team earns by the second on Arc. Withdraw anytime, settles in about 350ms.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#171618",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${display.variable}`}
    >
      <body className="min-h-screen bg-paper text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
