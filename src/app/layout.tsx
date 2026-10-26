import type { Metadata, Viewport } from "next";
import { Pwa } from "@/components/Pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Math Buddy — family math tutoring",
  description: "Daily math drills and a homework helper that teaches instead of telling.",
  applicationName: "Math Buddy",
  appleWebApp: { capable: true, title: "Math Buddy", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        {children}
        <Pwa />
      </body>
    </html>
  );
}
