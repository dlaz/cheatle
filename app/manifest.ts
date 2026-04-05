import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cheatle",
    short_name: "Cheatle",
    description: "Helps you cheat at Wordle...just a little bit.",
    start_url: "/",
    display: "standalone",
    background_color: "#121213",
    theme_color: "#121213",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
