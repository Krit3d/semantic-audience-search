import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const devPort = process.env.VITE_DEV_PORT ? Number(process.env.VITE_DEV_PORT) : undefined;

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        en: fileURLToPath(new URL("./en.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: devPort,
    strictPort: Boolean(devPort),
    hmr: devPort ? { port: devPort } : undefined,
  },
});
