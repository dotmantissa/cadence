import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadence: Real-Time Payroll on Arc",
  description: "Stream USDC salaries per second. Powered by Arc's sub-second finality.",
  icons: { icon: "/logo.svg", shortcut: "/logo.svg" },
  openGraph: {
    title: "Cadence: Real-Time Payroll on Arc",
    description: "Stream USDC salaries per second on Arc blockchain.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-arc-dark text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
