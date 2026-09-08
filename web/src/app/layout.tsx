import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AccessibilityProvider } from "@/lib/accessibility-context";
import { Nav } from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TravIndi",
  description: "SIH 26204 — AI-powered smart travel & tourism / tourist-safety platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AccessibilityProvider>
            <Nav />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
          </AccessibilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
