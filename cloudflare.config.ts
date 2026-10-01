import { defineConfig } from "cf/config"
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" }

export default defineConfig({
    worker: {
        name: "what-time",
        compatibilityDate: "2026-09-25",
        entrypoint,
    },
})
