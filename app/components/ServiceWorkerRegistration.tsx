"use client";

import { useEffect } from "react";
import { basePath } from "../../lib/config";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // During local development, stale SW caches can serve old JS chunks and
    // leave the app seemingly non-interactive after code changes.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch((err) => console.error("Service worker unregister failed:", err));
      return;
    }

    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/`, updateViaCache: "none" })
      .catch((err) => console.error("Service worker registration failed:", err));
  }, []);

  return null;
}
