import {mkdir,readFile,chmod,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
const directory=path.resolve(".local/backups");await mkdir(directory,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replaceAll(":","-").replaceAll(".","-"),file=path.join(directory,"narv-"+stamp+".sql");
console.log("Exporting business data from D1...");
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,["node_modules/wrangler/bin/wrangler.js","d1","export","narv","--remote","--config","backend/wrangler.toml","--table","records","revision","--output",file],{stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);child.on("error",reject);child.on("exit",code=>{const safe=output.replace(/https?:\/\/[^\s]+/g,"[temporary download URL omitted]");process.stdout.write(safe);code===0?resolve():reject(Error("Backup export failed: "+code))})});
await chmod(file,0o600);
// Rehearse recovery in a new local database, never against the live service.
const restoreFile=path.join(directory,"restore-check-"+stamp+".sqlite"),db=new DatabaseSync(restoreFile);
try{
 db.exec(await readFile(file,"utf8"));db.exec(await readFile("backend/migrations/0001_initial.sql","utf8"));
 const counts=db.prepare("SELECT count(DISTINCT key) AS business_records FROM records").get();
 const privateAuth=db.prepare("SELECT count(*) AS n FROM auth").get().n;
 if(privateAuth!==0)throw Error("Backup unexpectedly contains login credentials.");
 const parts=db.prepare("SELECT key,part,data FROM records ORDER BY key,part").all(),values=new Map();
 for(const p of parts)values.set(p.key,(values.get(p.key)||"")+p.data);
 for(const value of values.values())JSON.parse(value);
 const revision=db.prepare("SELECT value FROM revision WHERE id=1").get().value;
 const report={timestamp:new Date().toISOString(),businessRecords:counts.business_records,revision,validJSONRecords:values.size,restoredLoginSessions:privateAuth};
 await writeFile(path.join(directory,"restore-check-"+stamp+".json"),JSON.stringify(report,null,2),{mode:0o600});
 console.log("PASS: business-data backup and local recovery rehearsal; no login sessions included.");
 console.log("Backup: "+file);
}finally{db.close();await chmod(restoreFile,0o600)}
