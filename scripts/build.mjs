import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const result=await build({entryPoints:['src/game-renderer.js'],bundle:true,format:'esm',minify:true,legalComments:'linked',outfile:'runtime/game-renderer.js',metafile:true});
const roots=new Set();
for(const path of Object.keys(result.metafile.inputs)){const match=path.match(/^(node_modules\/(?:@[^/]+\/)?[^/]+)\//);if(match)roots.add(match[1]);}
const notices=[];
for(const root of roots){const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));const files=await readdir(root);const license=files.find(f=>/^licen[cs]e(?:\.|$)/i.test(f));notices.push(`${pkg.name} ${pkg.version} — ${pkg.license||'see package'}\n${license?await readFile(join(root,license),'utf8'):pkg.repository?.url||pkg.homepage||''}`);}
await writeFile('runtime/THIRD-PARTY-LICENSES.txt',notices.join('\n\n--------------------\n\n'));
console.log('PixiJS renderer and third-party notices built.');
