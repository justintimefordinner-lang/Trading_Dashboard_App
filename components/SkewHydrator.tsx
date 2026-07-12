"use client";

// Seeds the client-side Simulate skew store from the persisted value in
// data/sim-config.json (via /api/sim-config) once on load, so the after-hours
// Simulate what-if uses the skew set on the Settings page instead of the
// hardcoded default. Renders nothing.
import { useEffect } from "react";
import { setIvSkew } from "@/lib/simConfig";

export function SkewHydrator() {
  useEffect(() => {
    fetch("/api/sim-config")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.ivSkew === "number") setIvSkew(d.ivSkew);
      })
      .catch(() => {});
  }, []);
  return null;
}
