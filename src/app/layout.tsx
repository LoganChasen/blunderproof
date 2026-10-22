import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Blunderproof: stop making the same chess blunders",
    template: "%s · Blunderproof",
  },
  description:
    "Analyze your Chess.com games in the browser, see why you blunder, then train on puzzles for your weak patterns and the exact positions you lost in.",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
  applicationName: "Blunderproof",
};

export const viewport: Viewport = {
  themeColor: "#262421",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg font-sans text-text">{children}</body>
    </html>
  );
}
