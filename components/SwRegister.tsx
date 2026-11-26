"use client";

import { useEffect } from "react";
import { Serwist } from "@serwist/window";

/** Registers /sw.js once; SW applies updates on next navigation (LD-FE-11). */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const serwist = new Serwist("/sw.js", { scope: "/" });
    void serwist.register().catch(() => {
      // SW register failure = app still works online-only (LLD §14).
    });
  }, []);
  return null;
}
