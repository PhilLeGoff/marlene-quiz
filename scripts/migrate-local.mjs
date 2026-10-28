import { readdirSync,readFileSync,existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(!existsSync('dist/server/wrangler.json'))throw new Error('Exécuter npm run build avant les migrations locales.');
mkdirSync('.sites-runtime',{recursive:true});const log='.sites-runtime/applied-migrations.json';const applied=existsSync(log)?JSON.parse(readFileSync(log,'utf8')):[];
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){if(applied.includes(file))continue;const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',`drizzle/${file}`],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);applied.push(file);writeFileSync(log,JSON.stringify(applied));}
