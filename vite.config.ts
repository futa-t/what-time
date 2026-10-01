import { cloudflare } from "@cloudflare/vite-plugin"
import { defineConfig, lazyPlugins } from "vite-plus"

export default defineConfig({
    fmt: {
        semi: false,
        printWidth: 120,
        tabWidth: 4,
        arrowParens: "avoid",
        trailingComma: "all",
    },
    lint: {
        jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
        rules: { "vite-plus/prefer-vite-plus-imports": "error" },
        options: { typeAware: true, typeCheck: true },
    },
    plugins: lazyPlugins(() => [cloudflare()]),
})
