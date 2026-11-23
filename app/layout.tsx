import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order Recovery | Supply Disruption Planning",
  description: "Trace supply disruptions to customer commitments, check eligible stock and capacity, and compare evidence-based recovery plans.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
