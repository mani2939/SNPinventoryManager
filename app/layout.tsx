import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Shapes & Pieces · Inventory",
  description:
    "Jewellery inventory and landed-cost management for Shapes & Pieces",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
