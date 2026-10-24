import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Math Buddy — family math tutoring",
  description: "Daily math drills and a homework helper that teaches instead of telling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
