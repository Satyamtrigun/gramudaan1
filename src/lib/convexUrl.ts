// Single source of truth for the Convex deployment URL.
//
// - In the Vly-managed workspace, VITE_CONVEX_URL is injected automatically.
// - For standalone deployments (Vercel / Netlify / Render from the public
//   repo), set VITE_CONVEX_URL in your host's environment settings to your
//   Convex deployment URL (e.g. https://<deployment>.convex.cloud).
// - The fallback keeps a deployed build from crashing on a missing env var
//   (it points at this project's dev deployment).
export const CONVEX_URL: string =
  (import.meta.env.VITE_CONVEX_URL as string | undefined) ||
  "https://honorable-akita-297.convex.cloud";
