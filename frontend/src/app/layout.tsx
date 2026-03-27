import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrendSupply - AI-Powered Trend & Supplier Intelligence",
  description:
    "Discover trending products, find reliable suppliers, and automate outreach with TrendSupply.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
