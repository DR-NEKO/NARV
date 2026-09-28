import {createDomainStore} from "../public/domain-store.js";
export const memory = initial => {
  const data=new Map(Object.entries(initial||{}));
  return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
};
export function engine(state,{scheduler=false}={}) {
  const storage=memory(state?{"narv-local-v2":JSON.stringify(state)}:undefined);
  return createDomainStore(storage,memory(),{seedDemo:false,runScheduler:scheduler});
}
function entries(state) {
  const map=new Map(),meta={};
  for(const [name,value] of Object.entries(state)) {
    if(Array.isArray(value)) {
      for(const item of value) {
        const id=item.id||(item.userId&&item.articleId?[item.userId,item.articleId].join(":"):item.actorId&&item.targetId?[item.actorId,item.targetId,item.date,item.from,item.to].join(":"):"");
        if(!id||id===":")throw Error("Invalid record key");
        map.set(name+"/"+id,JSON.stringify(item));
      }
    } else meta[name]=value;
  }
  map.set("meta",JSON.stringify(meta));return map;
}
export async function load(db) {
  const [rev,rows]=await db.batch([db.prepare("SELECT value FROM revision WHERE id=1"),db.prepare("SELECT key,part,data FROM records ORDER BY key,part")]);
  const values=new Map();
  for(const r of rows.results)values.set(r.key,(values.get(r.key)||"")+r.data);
  const state=engine().state();
  for(const [key,value] of values) {
    if(key==="meta")Object.assign(state,JSON.parse(value));
    else {const collection=key.split("/")[0];if(!Array.isArray(state[collection]))throw Error("Invalid collection");state[collection].push(JSON.parse(value));}
  }
  return {state,revision:rev.results[0].value};
}
export async function save(db,before,after) {
  const old=entries(before.state),next=entries(after),changed=[...next].filter(([k,v])=>old.get(k)!==v),removed=[...old.keys()].filter(k=>!next.has(k));
  if(!changed.length&&!removed.length)return before.revision;
  // Deliberately bounded pilot implementation: fail visibly before exhausting the free DB.
  if([...next.values()].reduce((n,v)=>n+new TextEncoder().encode(v).length,0)>8_000_000)throw Error("试运行存储达到上限，请联系编辑备份并扩容方案评估。");
  const token=crypto.randomUUID(),statements=[
    db.prepare("INSERT INTO write_guard(id,ok) SELECT ?, CASE WHEN value=? THEN 1 ELSE 0 END FROM revision WHERE id=1").bind(token,before.revision),
    db.prepare("UPDATE revision SET value=value+1 WHERE id=1")
  ];
  for(const key of [...removed,...changed.map(([k])=>k)])statements.push(db.prepare("DELETE FROM records WHERE key=?").bind(key));
  for(const [key,value] of changed) {
    for(let i=0;i<value.length;i+=180000)statements.push(db.prepare("INSERT INTO records(key,part,data) VALUES(?,?,?)").bind(key,i/180000,value.slice(i,i+180000)));
  }
  statements.push(db.prepare("DELETE FROM write_guard WHERE id=?").bind(token));
  if(statements.length>40)throw Error("本次变更过大，请拆分操作或联系编辑。");
  try {await db.batch(statements)} catch(e) {
    if(String(e).includes("CHECK")){const error=Error("内容已被其他人更新，请刷新后重新操作。");error.status=409;throw error}throw e;
  }
  return before.revision+1;
}
