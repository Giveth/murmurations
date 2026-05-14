import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7100,
    host: "127.0.0.1",
    // Allow access through the Tailscale Funnel hostname.
    allowedHosts: [".ts.net"],
    // HMR over the public funnel needs the right websocket host so the
    // client connects back through the same tunnel.
    hmr: {
      protocol: "wss",
      host: "desktop-dvvupq4.tail301743.ts.net",
      clientPort: 10000,
    },
    // Proxy ballot-API calls to the local Fastify server (server/api.mjs)
    // so the public funnel only needs to expose vite — no second port to
    // tunnel. Same pattern the ETHSec badge uses.
    proxy: {
      "/api": "http://127.0.0.1:7101",
    },
  },
  // Vite's built-in @vitejs/plugin-react handles .jsx and .tsx natively
  // by extension — no global esbuild loader override needed (and overriding
  // it breaks .tsx parsing because esbuild applies the loader to *all*
  // matched files, including TypeScript ones).
});
