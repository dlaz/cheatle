"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: `${basePath}/`, updateViaCache: "none" })
        .catch((err) => console.error("Service worker registration failed:", err));
    }
  }, []);

  return null;
}
