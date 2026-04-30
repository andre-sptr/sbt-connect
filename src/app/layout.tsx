import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SBT Bot Dashboard",
  description: "Dashboard bot WAHA Google Sheet",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
