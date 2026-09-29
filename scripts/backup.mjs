import {mkdir,readFile,readdir,chmod,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {decompress,references} from "../backend/codec.js";
import path from "node:path";
const directory=path.resolve(".local/backups");await mkdir(directory,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replaceAll(":","-").replaceAll(".","-"),file=path.join(directory,"narv-"+stamp+".sql");
const tables=["records","revision",...(!process.argv.includes("--legacy")?["entities","blobs","blob_links","public_documents","public_blob_refs","vote_totals","score_totals","support_totals","storage_totals",...(!process.argv.includes("--pre-lifecycle")?["account_erasure",...(!process.argv.includes("--pre-feedback")?["feedback"]:[])]:[])]:[])];
console.log("Exporting business data from D1...");
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,["node_modules/wrangler/bin/wrangler.js","d1","export","narv","--remote","--config","backend/wrangler.toml","--table",...tables,"--output",file],{stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);child.on("error",reject);child.on("exit",code=>{process.stdout.write(output.replace(/https?:\/\/[^\s]+/g,"[temporary download URL omitted]"));code===0?resolve():reject(Error("Backup export failed: "+code))})});
await chmod(file,0o600);
const restoreFile=path.join(directory,"restore-check-"+stamp+".sqlite"),db=new DatabaseSync(restoreFile);
try{
 db.exec(await readFile(file,"utf8"));for(const f of (await readdir("backend/migrations")).filter(f=>f.endsWith(".sql")).sort())db.exec(await readFile("backend/migrations/"+f,"utf8"));
 if(db.prepare("SELECT count(*) AS n FROM auth").get().n!==0)throw Error("Backup unexpectedly contains login credentials.");
 const parts=db.prepare("SELECT key,part,data FROM records ORDER BY key,part").all(),values=new Map();for(const p of parts)values.set(p.key,(values.get(p.key)||"")+p.data);
 let referenced=0;for(const value of values.values()){const item=JSON.parse(await decompress(value));for(const hash of references(item)){if(!db.prepare("SELECT 1 FROM blobs WHERE hash=?").get(hash))throw Error("Missing backup attachment");referenced++}}
 const report={timestamp:new Date().toISOString(),businessRecords:values.size,revision:db.prepare("SELECT value FROM revision WHERE id=1").get().value,validJSONRecords:values.size,referencedAttachments:referenced,accounts:db.prepare("SELECT count(*) AS n FROM entities WHERE kind='users'").get().n,restoredLoginSessions:0,privateFeedbacks:db.prepare("SELECT count(*) AS n FROM feedback").get().n};
 await writeFile(path.join(directory,"restore-check-"+stamp+".json"),JSON.stringify(report,null,2),{mode:0o600});
 console.log("PASS: compressed business records, attachments and index recovery; no login sessions included.");
 console.log("Backup: "+file);
}finally{db.close();await chmod(restoreFile,0o600)}
