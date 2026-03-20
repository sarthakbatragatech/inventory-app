import Link from 'next/link';
import type { Metadata } from "next";
import { Brand } from '@/components/brand';
import { Geist, Geist_Mono } from "next/font/google";
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
                href="/upload"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                Upload
              </Link>
              <Link
                href="/items"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                Items
              </Link>
              <Link
                href="/imports"
                className="rounded-full px-3 py-2 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                Imports
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
