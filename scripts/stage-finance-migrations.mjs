import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../supabase/',import.meta.url));
const workdir=mkdtempSync(join(tmpdir(),'verdantpay-finance-'));
const staged=join(workdir,'supabase');
const migrations=join(staged,'migrations');
mkdirSync(migrations,{recursive:true});
const baseline='202611220018_finance_prerequisites.sql';
copyFileSync(join(root,'finance-bootstrap',baseline),join(migrations,baseline));
const financeFiles=readdirSync(join(root,'migrations')).filter(name=>/^\d{12,14}_finance(?:_|\.)/.test(name)).sort();
for(const file of financeFiles)copyFileSync(join(root,'migrations',file),join(migrations,file));
writeFileSync(join(staged,'config.toml'),'project_id = "verdantpay-finance"\n[db]\nmajor_version = 17\n[db.seed]\nenabled = false\n');
console.log(workdir);
