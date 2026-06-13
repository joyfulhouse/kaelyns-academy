import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Lexend } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "Kaelyn's Academy",
    template: "%s · Kaelyn's Academy",
  },
  description:
    "A warm, adaptive learning studio for young children. Every subject meets each child at her real level and teaches forward, one mastered skill at a time, with gentle AI tutoring.",
  applicationName: "Kaelyn's Academy",
};

export const viewport: Viewport = {
  themeColor: "#fdf6e9",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${lexend.variable}`}>
      <body>{children}</body>
    </html>
  );
}
