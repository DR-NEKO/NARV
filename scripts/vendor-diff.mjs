import {build} from "esbuild";
import {mkdir,copyFile} from "node:fs/promises";
await mkdir("public/vendor/diff",{recursive:true});
await build({stdin:{contents:'export {diffLines,diffChars} from "diff";',resolveDir:process.cwd()},bundle:true,minify:true,format:"esm",target:"es2022",outfile:"public/vendor/diff/index.mjs",legalComments:"eof"});
await copyFile("node_modules/diff/LICENSE","public/vendor/diff/LICENSE");
console.log("Vendored jsdiff with license.");
