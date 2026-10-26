import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Math Buddy",
    short_name: "Math Buddy",
    description: "Daily math drills and a homework helper that teaches instead of telling.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    lang: "en",
    dir: "ltr",
    categories: ["education"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Student login",
        short_name: "Student",
        description: "Log in with a family code and PIN",
        url: "/student-login",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }],
      },
      {
        name: "Parent login",
        short_name: "Parent",
        description: "Log in as a parent",
        url: "/login",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }],
      },
    ],
  };
}
