import {exportPublic} from "./export-public.mjs";
import {cp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {build} from "esbuild";
import path from "node:path";
import {createHash} from "node:crypto";
const api=process.env.NARV_API_URL?.replace(/\/$/,"");
if(api&&!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(api))throw Error("NARV_API_URL must be an HTTPS API origin, without a path.");
const output=path.resolve("dist");if(path.dirname(output)!==process.cwd())throw Error("Invalid output directory");
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});await cp("public",output,{recursive:true});
if(api)await exportPublic(api,output);
const config={mode:api?"remote":"local-demo",...(api?{apiBase:api}:{})};
await writeFile("dist/config.js","export const config = "+JSON.stringify(config)+";\n");
const result=await build({
 entryPoints:["public/app.js"],bundle:true,splitting:true,format:"esm",target:"es2022",minify:true,charset:"utf8",
 outdir:"dist/assets/app",entryNames:"[name]-[hash]",chunkNames:"[name]-[hash]",metafile:true,
 plugins:[{name:"narv-config",setup(b){b.onResolve({filter:/config\.js$/},a=>a.path==="./config.js"?{path:"config",namespace:"narv"}:undefined);b.onLoad({filter:/.*/,namespace:"narv"},()=>({contents:"export const config="+JSON.stringify(config),loader:"js"}))}}]
});
const entry=Object.entries(result.metafile.outputs).find(([,m])=>m.entryPoint==="public/app.js")[0].replace(/^dist\//,"./");
let html=await readFile("dist/index.html","utf8");
html=html.replace('src="./app.js"','src="'+entry+'"');
for(const file of ["styles.css","theme.css"]){const text=await readFile("dist/"+file,"utf8"),hash=createHash("sha256").update(text).digest("hex").slice(0,12);const version=file.replace(".css","-"+hash+".css");await writeFile("dist/"+version,text);html=html.replace('href="./'+file+'"','href="./'+version+'"')}
if(api){
 const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' "+api+"; object-src 'none'; base-uri 'self'; form-action 'self'";
 html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
}
await writeFile("dist/index.html",html);await writeFile("dist/.nojekyll","");
console.log("Built hashed app "+entry+"; formula renderer loads on demand.");
