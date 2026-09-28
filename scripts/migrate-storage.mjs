import {readFile,readdir,writeFile,mkdir,chmod} from "node:fs/promises";
import {spawn} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {sqlite} from "./sqlite-adapter.mjs";
import {migrateRecords} from "../backend/repository.js";
import {publicStatements} from "../backend/public-content.js";
import {loginKeyFor} from "../backend/security.js";
import {withIdentities} from "../public/identity.js";
// Run with the Worker in MAINTENANCE=1. CLI HTTPS transport works with the
// development proxy; remote workerd bindings cannot use that proxy reliably.
async function wrangler(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,["node_modules/wrangler/bin/wrangler.js",...args,"--config","backend/wrangler.toml"],{stdio:["ignore","pipe","pipe"]});let output="";p.stdout.on("data",b=>output+=b);p.stderr.on("data",b=>output+=b);p.on("error",reject);p.on("exit",async code=>{if(code===0)resolve(output);else{await writeFile(".local/migration-operation.log",output.replace(/https?:\/\/[^\s]+/g,"[temporary URL omitted]"),{mode:0o600});reject(Error("Wrangler "+args.slice(0,2).join(" ")+" failed; see .local/migration-operation.log"))}})})}
const folder=path.resolve(".local");await mkdir(folder,{recursive:true,mode:0o700});
const stamp=Date.now(),source=path.join(folder,"migration-source-"+stamp+".sql"),dbfile=path.join(folder,"migration-work-"+stamp+".sqlite"),output=path.join(folder,"storage-upgrade-"+stamp+".sql");
const tables=["records","entities","blobs","blob_links","public_documents","public_blob_refs","vote_totals","score_totals","support_totals","storage_totals"];
await wrangler(["d1","export","narv","--remote","--table",...tables,"revision","--output",source]);await chmod(source,0o600);
const raw=new DatabaseSync(dbfile);raw.exec(await readFile(source,"utf8"));raw.close();
const db=sqlite(dbfile),pepper=(await readFile(path.join(folder,"identity-pepper"),"utf8")).trim();
const originalRevision=(await db.prepare("SELECT value FROM revision WHERE id=1").first()).value;
try{
 await migrateRecords(db,{publicize:(db,e,r)=>publicStatements(db,e,r,{apiBase:"https://narv-api.dr-neko-narv.workers.dev"}),transform:async(st,key)=>{
  if(key.startsWith("users/"))for(const u of st.users){Object.assign(u,withIdentities(u));if(u.loginKey?.startsWith("github:"))u.loginKey=await loginKeyFor({IDENTITY_PEPPER:pepper},u.loginKey.slice(7))}
  return st;
 }});
 await db.batch([
 db.prepare("DELETE FROM vote_totals"),db.prepare("INSERT INTO vote_totals SELECT article_id,SUM(CASE WHEN json_extract(head,'$.value')=1 THEN 1 ELSE 0 END),SUM(CASE WHEN json_extract(head,'$.value')=-1 THEN 1 ELSE 0 END) FROM entities WHERE kind='votes' GROUP BY article_id"),
 db.prepare("DELETE FROM score_totals"),db.prepare("INSERT INTO score_totals SELECT owner_id,SUM(json_extract(head,'$.points')) FROM entities WHERE kind='scoreEvents' GROUP BY owner_id"),
 db.prepare("INSERT INTO support_totals(article_id,supporters) SELECT article_id,count(DISTINCT owner_id) FROM entities e WHERE (kind='bookmarks' OR (kind='votes' AND json_extract(head,'$.value')=1)) AND owner_id!=(SELECT owner_id FROM entities WHERE key='submissions/'||e.article_id) GROUP BY article_id ON CONFLICT(article_id) DO UPDATE SET supporters=excluded.supporters")
 ]);
 const literal=v=>v===null?"NULL":typeof v==="number"?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const token="upgrade-"+stamp,lines=["INSERT INTO write_guard(id,ok) SELECT '"+token+"',CASE WHEN value="+originalRevision+" THEN 1 ELSE 0 END FROM revision WHERE id=1;"];
 // Rebuild derived tables and rewrite the complete fresh business snapshot.
 // Auth / sessions / rate-limits are deliberately excluded.
 for(const table of tables)lines.push("DELETE FROM "+table+";");
 // Entity/blob triggers regenerate aggregate bytes/points. Explicit values below
 // overwrite those aggregates with the rehearsed final values.
 for(const table of tables){
  const rows=(await db.prepare("SELECT * FROM "+table).all()).results;
  if(["score_totals","storage_totals"].includes(table))lines.push("DELETE FROM "+table+";");
  for(const r of rows)lines.push("INSERT INTO "+table+"("+Object.keys(r).join(",")+") VALUES("+Object.values(r).map(literal).join(",")+");");
 }
 const revision=(await db.prepare("SELECT value FROM revision WHERE id=1").first()).value;
 lines.push("UPDATE revision SET value="+revision+" WHERE id=1;","DELETE FROM write_guard WHERE id='"+token+"';");
 await writeFile(output,lines.join("\n"),{mode:0o600});await wrangler(["d1","execute","narv","--remote","--file",output]);
 const check=await wrangler(["d1","execute","narv","--remote","--json","--command","SELECT count(*) AS accounts, SUM(role='original_editor') AS original_editors, SUM(login_key LIKE 'ghh:%') AS confidential_bindings, SUM(json_extract(head,'$.community.uid') IS NOT NULL AND json_extract(head,'$.review.uid') IS NOT NULL) AS stable_dual_uids FROM entities WHERE kind='users'"]);
 const result=JSON.parse(check.replace(/\u001b\[[0-9;]*m/g,"").match(/(?:^|\n)(\[\s*\{[\s\S]*)$/)[1]).flatMap(r=>r.results||[]);console.log(JSON.stringify({migration:"complete",counts:result}));
}finally{db.close();await chmod(dbfile,0o600)}
