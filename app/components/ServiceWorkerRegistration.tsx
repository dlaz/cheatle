"use client";

import { useEffect } from "react";
import { basePath } from "../../lib/config";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: `${basePath}/`, updateViaCache: "none" })
        .catch((err) => console.error("Service worker registration failed:", err));
    }
  }, []);

  return null;
}
