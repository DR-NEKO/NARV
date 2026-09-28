import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
export function sqlite(path=":memory:"){
 const db=new DatabaseSync(path);db.exec(readFileSync(new URL("../backend/migrations/0001_initial.sql",import.meta.url),"utf8"));
 function prepare(sql,args=[]){
  const invoke=()=>{const stmt=db.prepare(sql),results=stmt.all(...args);return {results,success:true,meta:{changes:Number(db.prepare("SELECT changes() AS n").get().n)}}};
  return {bind:(...params)=>prepare(sql,params),all:async()=>invoke(),run:async()=>invoke(),first:async()=>invoke().results[0]||null,_run:invoke};
 }
 return {prepare,batch:async statements=>{db.exec("BEGIN IMMEDIATE");try{const r=statements.map(s=>s._run());db.exec("COMMIT");return r}catch(e){db.exec("ROLLBACK");throw e}},close:()=>db.close()};
}
