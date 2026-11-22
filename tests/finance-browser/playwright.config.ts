import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
import {backend,frontend,previewAnon,previewService} from './preview-auth';
const cwd=resolve(import.meta.dirname,'../..');
const worker=process.env.FINANCE_TEST_WORKERS==='1';
const frontendCommand=worker
 ?'pnpm --filter @mfu/admin start:vinext --host 127.0.0.1 --port 3311 --strictPort'
 :'pnpm --filter @mfu/admin exec next start --hostname 127.0.0.1 --port 3311';
export default defineConfig({
 testDir:'.',testMatch:'*.spec.ts',workers:1,timeout:60000,reporter:'list',
 outputDir:resolve(cwd,'test-results/finance-browser'),
 use:{baseURL:frontend,trace:'retain-on-failure',browserName:'chromium'},
 webServer:[
  {command:'pnpm exec tsx tests/finance-browser/preview-server.ts',url:backend+'/health',cwd,timeout:35000},
  {command:frontendCommand,url:frontend+'/finance/login',cwd,timeout:60000,
   env:{SUPABASE_URL:backend,SUPABASE_ANON_KEY:previewAnon,SUPABASE_SERVICE_ROLE_KEY:previewService,APP_ORIGIN:frontend,ADMIN_ORIGIN:frontend}},
 ],
});
