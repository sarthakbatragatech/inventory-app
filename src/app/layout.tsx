import type { Metadata } from "next";
import { Brand } from '@/components/brand';
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tycoon Inventory",
  description: "Tycoon SKU inventory, inward uploads, and item history",
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
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Brand compact />
            <nav className="flex items-center gap-1 text-sm sm:gap-2">
              <Link
                href="/"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-sky-100 hover:text-sky-950"
              >
                Home
              </Link>
              <Link
                href="/tools"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-950"
              >
                Tools
              </Link>
              <Link
                href="/bom"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-amber-100 hover:text-amber-950"
              >
                BOM
              </Link>
              <Link
                href="/stock"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-emerald-100 hover:text-emerald-950"
              >
                Stock
              </Link>
              <Link
                href="/reconciliation"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-stone-200 hover:text-stone-950"
              >
                Reconciliation
              </Link>
              <Link
                href="/items"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-violet-100 hover:text-violet-950"
              >
                Inward Data
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
