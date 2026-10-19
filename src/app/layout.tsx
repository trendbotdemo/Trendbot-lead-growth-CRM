import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TrendBot Growth Center", template: "%s · TrendBot" },
  description: "Calls, leads, reviews and growth score for local businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-[14px]">{children}</body>
    </html>
  );
}
