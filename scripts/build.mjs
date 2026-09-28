import {exportPublic} from "./export-public.mjs";
import {cp,mkdir,writeFile,readFile} from "node:fs/promises";
const api=process.env.NARV_API_URL?.replace(/\/$/,"");
if(api&&!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(api))throw Error("NARV_API_URL must be an HTTPS API origin, without a path.");
await mkdir("dist",{recursive:true});await cp("public","dist",{recursive:true});
if(api){
 await exportPublic(api,"dist");
 await writeFile("dist/config.js","export const config = "+JSON.stringify({mode:"remote",apiBase:api})+";\n");
 let html=await readFile("dist/index.html","utf8");
 const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' "+api+"; object-src 'none'; base-uri 'self'; form-action 'self'";
 html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
 await writeFile("dist/index.html",html);
}
await writeFile("dist/.nojekyll","");console.log("Built GitHub Pages output in dist/ ("+(api?"API mode":"local demo")+")");
