import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Math Buddy",
    short_name: "Math Buddy",
    description: "Daily math drills and a homework helper that teaches instead of telling.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    categories: ["education", "kids"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Daily drill", url: "/student/drill", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Homework help", url: "/student/homework", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
