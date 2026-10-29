import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smartfolio Analyser",
  description:
    "Understand portfolio performance with transparent calculations and traceable market data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
