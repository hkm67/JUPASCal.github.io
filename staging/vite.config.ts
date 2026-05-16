import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    {
      name: "serve-parent-data",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/data/")) return next();
          try {
            const filePath = resolve(projectDir, req.url.slice(1));
            const content = await readFile(filePath);
            res.setHeader("Content-Type", req.url.endsWith(".json") ? "application/json" : "text/plain");
            res.end(content);
          } catch {
            next();
          }
        });
      },
    },
  ],
  base: "./",
  server: {
    fs: {
      allow: [".."],
    },
    allowedHosts: [".trycloudflare.com"],
  },
});
