import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CornerMenu } from "@/components/CornerMenu";
import { getSession } from "@/server/auth/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "Maple MPSS LinkedIn Dashboard", robots: { index: false, follow: false } };
// Every page reads live data from the database, so nothing is built ahead of time.
export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-cream font-sans text-ink antialiased" suppressHydrationWarning>
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
        <CornerMenu csrf={session?.csrf ?? null} />
      </body>
    </html>
  );
}
