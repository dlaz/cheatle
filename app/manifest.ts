import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return {
    name: "Cheatle",
    short_name: "Cheatle",
    description: "Helps you cheat at Wordle...just a little bit.",
    start_url: basePath || "/",
    display: "standalone",
    background_color: "#121213",
    theme_color: "#121213",
    icons: [
      {
        src: `${basePath}/icon-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icon-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
