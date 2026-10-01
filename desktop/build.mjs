import { build as viteBuild } from 'vite';
import { build as bundle } from 'esbuild';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const desktop = dirname(fileURLToPath(import.meta.url));
const root = resolve(desktop, '..');
await viteBuild({
  configFile: false, root: desktop, base: '/', publicDir: false,
  plugins: [react()], resolve: { alias: { '@': root } },
  css: { postcss: resolve(root, 'postcss.config.mjs') },
  build: { outDir: resolve(desktop, 'app/renderer'), emptyOutDir: true },
});
await bundle({absWorkingDir:root,entryPoints: ['desktop/local-service.mjs'], outfile: 'desktop/app/service.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24',tsconfigRaw:{}});
await bundle({absWorkingDir:root,entryPoints: ['desktop/smoke.mjs'], outfile: 'desktop/app/smoke.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24',tsconfigRaw:{}});
await bundle({absWorkingDir:root,entryPoints:['desktop/psd-worker.mjs'],outfile:'desktop/app/psd-worker.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',tsconfigRaw:{}});
// Code-native icon: scalable source with PNG-backed Windows ICO sizes.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#141c29"/><path d="M48 48h68v24H72v112h44v24H48zm160 0v160h-68v-24h44V72h-44V48z" fill="#ff7b26"/><path d="m107 93 56 35-56 35z" fill="#f2f5f9"/></svg>`;
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(n => sharp(Buffer.from(icon)).resize(n,n).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(1,2); head.writeUInt16LE(sizes.length,4);
let offset = head.length;
sizes.forEach((n,i) => { const p=6+i*16; head[p]=n===256?0:n; head[p+1]=head[p]; head.writeUInt16LE(1,p+4); head.writeUInt16LE(32,p+6); head.writeUInt32LE(pngs[i].length,p+8); head.writeUInt32LE(offset,p+12); offset+=pngs[i].length; });
await mkdir(resolve(desktop,'assets'),{recursive:true});
await writeFile(resolve(desktop,'assets/icon.svg'),icon);
await writeFile(resolve(desktop,'assets/icon.ico'),Buffer.concat([head,...pngs]));
console.log('Local desktop renderer, service and application icon built.');
