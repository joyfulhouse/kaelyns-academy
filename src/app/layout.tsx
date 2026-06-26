import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Lexend } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { IosInstallHint } from "@/components/pwa/IosInstallHint";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

const SITE_URL = "https://kaelyns.academy";
const SITE_DESCRIPTION =
  "A warm, adaptive learning studio for young children. Every subject meets each child at her real level and teaches forward, one mastered skill at a time, with gentle AI tutoring.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Kaelyn's Academy",
    template: "%s · Kaelyn's Academy",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Kaelyn's Academy",
  appleWebApp: { capable: true, title: "Kaelyn's Academy", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "Kaelyn's Academy",
    title: "Kaelyn's Academy",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    // og:image is provided by the file convention (src/app/opengraph-image.tsx).
  },
  twitter: {
    card: "summary_large_image",
    title: "Kaelyn's Academy",
    description: SITE_DESCRIPTION,
    // twitter:image falls back to the opengraph-image card.
  },
};

export const viewport: Viewport = {
  themeColor: "#fdf6e9",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${lexend.variable}`}>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
          {children}
          <IosInstallHint />
        </SerwistProvider>
      </body>
    </html>
  );
}
