import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frame Studio — Broadcast Graphics",
  description: "Design, animate, connect data, and control broadcast graphics in one studio.",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
