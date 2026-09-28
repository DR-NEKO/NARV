import {createDomainStore} from "../public/domain-store.js";
import {codecPlan,compress,decompress,hydrate,references,toBase64} from "./codec.js";
export const memory=initial=>{const data=new Map(Object.entries(initial||{}));return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
export function engine(state,{scheduler=false}={}){return createDomainStore(memory(state?{"narv-local-v2":JSON.stringify(state)}:undefined),memory(),{seedDemo:false,runScheduler:scheduler})}
export function entries(state){
 const map=new Map(),meta={};
 for(const [kind,value] of Object.entries(state)){if(Array.isArray(value)){for(const item of value){const id=item.id||(item.userId&&item.articleId?[item.userId,item.articleId].join(":"):item.actorId&&item.targetId?[item.actorId,item.targetId,item.date,item.from,item.to].join(":"):"");if(!id)throw Error("Invalid record key");map.set(kind+"/"+id,item)}}else meta[kind]=value}
 map.set("meta",meta);return map;
}
export function head(kind,item){
 if(kind==="submissions")return {...item,content:"",images:{},authorAvatar:"◈",workingDraft:undefined,publicSnapshot:item.publicSnapshot?{...item.publicSnapshot,content:"",images:{},authorAvatar:"◈"}:undefined,versions:item.versions?.map(v=>({version:v.version,title:v.title,date:v.date})),history:[],reviews:item.reviews?.map(r=>({...r,note:r.note?.length>=10?"已提供完整具体审稿意见":""})),requests:[],consents:[],appeals:item.appeals?.map(a=>({date:a.date,toRank:a.toRank}))};
 if(kind==="users")return {...item,community:item.community?{...item.community,avatar:typeof item.community.avatar==="object"?"◈":item.community.avatar}:undefined,review:item.review?{...item.review,avatar:typeof item.review.avatar==="object"?"◇":item.review.avatar}:undefined};
 if(kind==="comments")return {...item,avatar:"◈",history:[],versions:[]};
 if(kind==="reports")return {...item,reason:item.reason.slice(0,300),evidence:"",history:[]};
 return item;
}
export function metadata(key,item,bytes=0){
 const [kind,id]=key==="meta"?["meta","meta"]:key.split("/");
 return {key,kind,id,owner:item.reporterId||item.authorId||item.userId||item.targetId||"",reviewer:item.handlerId||item.reviewerId||"",status:item.status||"",role:item.role||"",login:item.loginKey||"",community:item.community?.name||"",review:item.review?.name||"",article:item.articleId||"",rank:item.requiredRank||1,created:item.createdAt||item.date||"",updated:item.updatedAt||item.date||item.createdAt||"",scheduled:item.scheduledAt||"",bytes,head:JSON.stringify(head(kind,item))};
}
export async function select(db,where,args=[],{limit=100,offset=0}={}){
 return (await db.prepare("SELECT key,version,head FROM entities WHERE "+where+" ORDER BY updated_at DESC,key LIMIT ? OFFSET ?").bind(...args,limit,offset).all()).results;
}
export async function load(db,options={}){
 const scoped=options.keys!==undefined;
 const params=scoped?[JSON.stringify([...new Set(["meta",...options.keys])])]:[];
 const [rows,infos,revisionRow]=await db.batch([
 db.prepare("SELECT key,part,data FROM records"+(scoped?" WHERE key IN (SELECT value FROM json_each(?))":"")+" ORDER BY key,part").bind(...params),
 db.prepare("SELECT key,version FROM entities"+(scoped?" WHERE key IN (SELECT value FROM json_each(?))":"")).bind(...params),
 db.prepare("SELECT value FROM revision WHERE id=1")
 ]);
 const values=new Map();for(const r of rows.results)values.set(r.key,(values.get(r.key)||"")+r.data);
 const state=engine().state();
 for(const [key,text] of values){const value=JSON.parse(await decompress(text));if(key==="meta")Object.assign(state,value);else state[key.split("/")[0]].push(options.hydrate===false?value:await hydrate(db,value))}
 const revision=revisionRow.results[0].value;
 return {state,revision,versions:Object.fromEntries(infos.results.map(r=>[r.key,r.version])),dependencies:[],readOnly:new Set()};
}
export async function loadKeys(db,keys,{hydrate:shouldHydrate=false}={}){return load(db,{keys,hydrate:shouldHydrate})}
export function appendHeads(before,rows){
 const present=new Set(entries(before.state).keys());
 for(const row of rows){if(present.has(row.key))continue;const kind=row.key.split("/")[0];before.state[kind].push(JSON.parse(row.head));before.versions[row.key]=row.version;before.readOnly.add(row.key);present.add(row.key)}return before;
}
export async function save(db,before,after,{forceIndex=false,extra=[],publicize}={}){
 const old=entries(before.state),next=entries(after),changed=[...next].filter(([k,v])=>JSON.stringify(old.get(k))!==JSON.stringify(v)||(forceIndex&&!Object.hasOwn(before.versions||{},k))),removed=[...old.keys()].filter(k=>!next.has(k));
 if(!changed.length&&!removed.length&&!extra.length)return before.revision;
 for(const [key] of changed)if(before.readOnly?.has(key))throw Error("Cannot persist a summary record");
 const plan=codecPlan(),encoded=[];
 for(const [key,value] of changed){const packed=await plan.pack(value),text=await compress(JSON.stringify(packed));encoded.push({key,packed,text,meta:metadata(key,packed,new TextEncoder().encode(text).length)})}
 const guardKeys=[...new Set([...changed.map(([k])=>k),...removed,...before.dependencies||[]])];
 const expectations=guardKeys.map(key=>({key,version:before.versions?.[key]??-1})),token=crypto.randomUUID();
 const statements=[
 db.prepare("INSERT INTO write_guard(id,ok) SELECT ?, CASE WHEN EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN entities e ON e.key=json_extract(j.value,'$.key') WHERE COALESCE(e.version,-1)!=json_extract(j.value,'$.version')) THEN 0 ELSE 1 END").bind(token,JSON.stringify(expectations))
 ];
 for(const key of removed){statements.push(db.prepare("DELETE FROM records WHERE key=?").bind(key),db.prepare("DELETE FROM blob_links WHERE entity_key=?").bind(key),db.prepare("DELETE FROM entities WHERE key=?").bind(key))}
 for(const blob of plan.blobs.values())statements.push(db.prepare("INSERT OR IGNORE INTO blobs(hash,mime,data,bytes,created_at) VALUES(?,?,?,?,?)").bind(blob.hash,blob.mime,toBase64(blob.data),toBase64(blob.data).length,new Date().toISOString()));
 const changedKeys=encoded.map(e=>e.key);
 if(changedKeys.length){
 statements.push(db.prepare("DELETE FROM records WHERE key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(changedKeys)));
 const parts=[];for(const e of encoded)for(let i=0;i<e.text.length;i+=180000)parts.push({key:e.key,part:i/180000,data:e.text.slice(i,i+180000)});
 statements.push(db.prepare("INSERT INTO records(key,part,data) SELECT json_extract(value,'$.key'),json_extract(value,'$.part'),json_extract(value,'$.data') FROM json_each(?)").bind(JSON.stringify(parts)));
 const metas=encoded.map(e=>e.meta);
 statements.push(db.prepare("INSERT INTO entities(key,kind,id,owner_id,reviewer_id,status,role,login_key,community_name,review_name,article_id,required_rank,created_at,updated_at,scheduled_at,bytes,head) SELECT json_extract(value,'$.key'),json_extract(value,'$.kind'),json_extract(value,'$.id'),json_extract(value,'$.owner'),json_extract(value,'$.reviewer'),json_extract(value,'$.status'),json_extract(value,'$.role'),json_extract(value,'$.login'),json_extract(value,'$.community'),json_extract(value,'$.review'),json_extract(value,'$.article'),json_extract(value,'$.rank'),json_extract(value,'$.created'),json_extract(value,'$.updated'),json_extract(value,'$.scheduled'),json_extract(value,'$.bytes'),json_extract(value,'$.head') FROM json_each(?) WHERE 1 ON CONFLICT(key) DO UPDATE SET owner_id=excluded.owner_id,reviewer_id=excluded.reviewer_id,status=excluded.status,role=excluded.role,login_key=excluded.login_key,community_name=excluded.community_name,review_name=excluded.review_name,article_id=excluded.article_id,required_rank=excluded.required_rank,updated_at=excluded.updated_at,scheduled_at=excluded.scheduled_at,bytes=excluded.bytes,head=excluded.head,version=entities.version+1").bind(JSON.stringify(metas)));
 statements.push(db.prepare("DELETE FROM blob_links WHERE entity_key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(changedKeys)));
 const links=encoded.flatMap(e=>[...references(e.packed)].map(hash=>({key:e.key,hash})));
 if(links.length)statements.push(db.prepare("INSERT INTO blob_links(entity_key,hash) SELECT json_extract(value,'$.key'),json_extract(value,'$.hash') FROM json_each(?)").bind(JSON.stringify(links)));
 }

 if(publicize)statements.push(...await publicize(db,encoded,removed));
 statements.push(...extra,db.prepare("INSERT INTO write_guard(id,ok) SELECT ?,CASE WHEN bytes<=314572800 THEN 1 ELSE 0 END FROM storage_totals WHERE id=1").bind(token+":capacity"),db.prepare("UPDATE revision SET value=value+1 WHERE id=1 RETURNING value"),db.prepare("DELETE FROM write_guard WHERE id IN (?,?)").bind(token,token+":capacity"));
 if(statements.length>48)throw Error("本次变更较多，请分批处理。");
 let completed;try{completed=await db.batch(statements)}catch(error){if(/CHECK|UNIQUE/.test(String(error))){const e=Error("记录已有更新或触及存储限制，请刷新后重试；仍失败时请联系编辑。");e.status=409;throw e}throw error}
 return completed[completed.length-2].results[0].value;
}
export async function migrateRecords(db,{publicize,transform=v=>v}={}){
 const initial=await load(db,{hydrate:false});
 for(const key of entries(initial.state).keys()){const part=await loadKeys(db,[key]);const after=await transform(structuredClone(part.state),key);await save(db,part,after,{forceIndex:true,publicize})}
}
