import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "verdantpay",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-22",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      SUPABASE_URL: bindings.secret(),
      SUPABASE_ANON_KEY: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      APP_ORIGIN: bindings.secret(),
      ADMIN_ORIGIN: bindings.secret(),
    },
  }),
});
