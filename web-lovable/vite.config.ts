import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Plain client-rendered Vite SPA — adapted locally from the Lovable-hosted
// TanStack Start project as a temporary bridge while Lovable credits are
// unavailable (see root README for the full story). Same application code
// (routes/components/lib), simpler harness: no SSR, no Nitro/Cloudflare
// build target, no @lovable.dev/vite-tanstack-config (a Lovable-sandbox-only
// package). The canonical, actively-developed version of this frontend
// remains the Lovable project — sync changes back there once credits return.
export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss(), tsconfigPaths()],
  server: {
    port: 5173,
  },
});
