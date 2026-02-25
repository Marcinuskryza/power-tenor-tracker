import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages (repo project) -> base "./"
export default defineConfig({
  plugins: [react()],
  base: "./",
});
