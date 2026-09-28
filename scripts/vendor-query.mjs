import {build} from "esbuild";
import {copyFile,mkdir,readFile} from "node:fs/promises";
await mkdir("public/vendor/query-core",{recursive:true});
await build({stdin:{contents:'export {QueryClient} from "@tanstack/query-core";',resolveDir:process.cwd()},bundle:true,minify:true,format:"esm",target:"es2022",outfile:"public/vendor/query-core/index.mjs",legalComments:"eof"});
await copyFile("node_modules/@tanstack/query-core/LICENSE","public/vendor/query-core/LICENSE");
