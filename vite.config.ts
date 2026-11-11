import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The @replit/vite-plugin-* packages (cartographer, dev-banner,
// runtime-error-modal) were removed — they only do anything inside Replit.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
