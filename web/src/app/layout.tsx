import type { Metadata } from "next";
import { Geist_Mono, Manrope, Marcellus } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AccessibilityProvider } from "@/lib/accessibility-context";
import { Nav } from "@/components/Nav";
import { ChatbotWidget } from "@/components/ChatbotWidget";

const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: "400",
});

const manrope = Manrope({
  variable: "--font-manrope",
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
      className={`${marcellus.variable} ${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AccessibilityProvider>
            <Nav />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">{children}</main>
            <ChatbotWidget />
          </AccessibilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
