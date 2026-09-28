import {randomBytes} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {spawn} from "node:child_process";
await mkdir(".local",{recursive:true,mode:0o700});let pepper;
try{pepper=(await readFile(".local/identity-pepper","utf8")).trim()}catch(e){if(e.code!=="ENOENT")throw e;pepper=randomBytes(48).toString("base64url");await writeFile(".local/identity-pepper",pepper,{mode:0o600,flag:"wx"})}
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,["node_modules/wrangler/bin/wrangler.js","secret","put","IDENTITY_PEPPER","--config","backend/wrangler.toml"],{stdio:["pipe","pipe","pipe"]});let out="";child.stdout.on("data",c=>out+=c);child.stderr.on("data",c=>out+=c);child.stdin.end(pepper+"\n");child.on("error",reject);child.on("exit",code=>{process.stdout.write(out.replaceAll(pepper,"[redacted]"));code===0?resolve():reject(Error("Secret configuration failed"))})});
