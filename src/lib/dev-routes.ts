import { notFound } from "@tanstack/react-router";

/**
 * Dev-only routes (mock gateway, PayFast sandbox tester) must not exist in a
 * normal production build. They are available under `vite dev`, or in a build
 * made on purpose with VITE_ENABLE_DEV_ROUTES=true (e.g. a sandbox deploy).
 */
export function assertDevRoutesEnabled(): void {
  const enabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_ROUTES === "true";
  if (!enabled) throw notFound();
}
