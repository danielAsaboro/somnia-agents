import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last Wish",
  description:
    "Digital testament desk for deploying and operating Last Wish inheritance records on Somnia Shannon.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
