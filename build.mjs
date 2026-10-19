import { build } from 'esbuild';
await build({entryPoints:['src/main.jsx'],bundle:true,minify:true,format:'esm',target:['chrome109','firefox115','safari16'],outfile:'public/app.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
