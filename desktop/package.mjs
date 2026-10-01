import {build,Platform,Arch} from 'electron-builder';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
await import('./build.mjs');
const directory=dirname(fileURLToPath(import.meta.url));
process.env.ELECTRON_BUILDER_CACHE??=join(directory,'.cache','builder');
process.env.ELECTRON_CACHE??=join(directory,'.cache','electron');
await build({projectDir:directory,targets:Platform.WINDOWS.createTarget(process.argv.includes('--portable')?'portable':'nsis',Arch.x64),publish:'never',config:{...JSON.parse(readFileSync(join(directory,'electron-builder.json'),'utf8')),electronDist:join(directory,'node_modules','electron','dist')}});
