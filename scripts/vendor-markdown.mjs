import {build} from "esbuild";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const out="public/vendor/markdown-it";await mkdir(out,{recursive:true});
await build({stdin:{contents:'export {default} from "markdown-it/browser";',resolveDir:process.cwd()},bundle:true,minify:true,format:"esm",target:"es2022",outfile:out+"/index.mjs",legalComments:"eof"});
const licenses=[["markdown-it","LICENSE"],["entities","LICENSE"],["linkify-it","LICENSE"],["mdurl","LICENSE"],["punycode.js","LICENSE-MIT.txt"],["uc.micro","LICENSE.txt"]];
let text="Self-hosted Markdown parser and bundled dependency licenses\n\n";
for(const [name,file] of licenses){const pkg=JSON.parse(await readFile("node_modules/"+name+"/package.json","utf8"));text+=name+" "+pkg.version+"\n"+await readFile("node_modules/"+name+"/"+file,"utf8")+"\n\n"}
await writeFile(out+"/LICENSES.txt",text);
console.log("Vendored Markdown parser with all bundled licenses.");
