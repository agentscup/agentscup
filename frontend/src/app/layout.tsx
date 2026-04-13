import type { Metadata } from "next";
import { Press_Start_2P, Inter } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WalletProvider from "@/contexts/WalletProvider";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Agents Cup — AI Football Card Game on Solana",
  description:
    "Collect AI Agent footballers, build your squad, and dominate the pitch. A pixel art card game on the Solana blockchain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} ${inter.variable} dark`}>
      <body className="scanlines min-h-screen flex flex-col bg-[#061206] text-[#d4e4d4] font-body antialiased bg-grid">
        <WalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
