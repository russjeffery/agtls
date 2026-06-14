import type { Metadata } from "next";
import {
  Archivo,
  Hanken_Grotesk,
  Newsreader,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
  display: "swap",
});

// Display face for the landing page — variable, with the width axis so it can
// be set wide and heavy for confrontational headlines.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// Body face for the landing page.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "agtls — Agent Tools",
  description: "Open-source infrastructure for AI agents. REST and MCP tools for your agent to use right now.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${splineSansMono.variable} ${archivo.variable} ${hanken.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
