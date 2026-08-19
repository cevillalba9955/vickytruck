import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    // antd + @ant-design/icons (009-central-mejora-visual) son el grueso del
    // bundle; separarlos en su propio chunk evita el warning de "chunk >
    // 500kB" y deja que el navegador cachee ese chunk aparte del código
    // propio de la app, que cambia mucho más seguido (mismo patrón que
    // rs956/frontend/vite.config.js).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("antd") || id.includes("@ant-design")) return "antd";
            if (id.includes("leaflet")) return "leaflet";
            if (id.includes("react")) return "react";
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
  },
});
