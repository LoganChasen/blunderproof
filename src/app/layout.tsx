import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blunderproof",
  description: "Turn your own chess blunders into training.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
