import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kaelyn's Academy",
    short_name: "Kaelyn's",
    description: "A warm, adaptive learning studio for young children.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdf6e9",
    theme_color: "#fdf6e9",
    lang: "en",
    dir: "ltr",
    categories: ["education", "kids"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
