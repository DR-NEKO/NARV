import {canonicalPublicURL,readThrottle} from "./security.js";
import {publicArticle} from "../public/identity.js";
import {references,digest,fromBase64} from "./codec.js";
const mediaURL=(value,base)=>value?.$narvBlob?base+"/api/public/media/"+value.$narvBlob:value;
export async function publicStatements(db,encoded,removed,{apiBase=""}={}){
 const statements=[];
 for(const key of removed)statements.push(db.prepare("DELETE FROM public_documents WHERE key=?").bind(key),db.prepare("DELETE FROM public_blob_refs WHERE document_key=?").bind(key));
 for(const entry of encoded){
  const s=entry.packed,kind=entry.meta.kind;let doc=null;
  if(kind==="submissions"&&(["published","retracted"].includes(s.status)||s.publicSnapshot)&&!["ban","temporary_down"].includes(s.moderation?.kind))doc={...publicArticle({...s,images:{},authorAvatar:"◈"}),images:s.status==="retracted"?{}:Object.fromEntries(Object.entries(s.publicSnapshot?.images||s.images||{}).map(([k,v])=>[k,mediaURL(v,apiBase)])),avatar:mediaURL(s.publicSnapshot?.authorAvatar||s.authorAvatar||"◈",apiBase),isLocal:false};
  if(kind==="comments"&&s.status==="published")doc={id:s.id,articleId:s.articleId,author:s.author,avatar:mediaURL(s.avatar||"◈",apiBase),content:s.content,status:s.status,createdAt:s.createdAt,updatedAt:s.updatedAt};
  if(kind==="announcements"&&s.active&&s.audience==="public")doc={id:s.id,title:s.title,content:s.content,audience:"public",date:s.date,pinned:s.pinned,active:true};
  if(!["submissions","comments","announcements"].includes(kind))continue;
  statements.push(db.prepare("DELETE FROM public_documents WHERE key=?").bind(entry.key),db.prepare("DELETE FROM public_blob_refs WHERE document_key=?").bind(entry.key));
  if(!doc)continue;
  const text=JSON.stringify(doc),etag=await digest(new TextEncoder().encode(text)),summary={...doc};delete summary.content;delete summary.images;
  statements.push(db.prepare("INSERT INTO public_documents(key,kind,id,article_id,updated_at,data,summary,etag) VALUES(?,?,?,?,?,?,?,?)").bind(entry.key,kind==="submissions"?"articles":kind,doc.id,doc.articleId||"",entry.meta.updated,text,JSON.stringify(summary),etag));
  const hashes=[...references(s)].filter(hash=>text.includes(hash));
  if(hashes.length)statements.push(db.prepare("INSERT INTO public_blob_refs(hash,document_key) SELECT value,? FROM json_each(?)").bind(entry.key,JSON.stringify(hashes)));
 }
 return statements;
}
export async function readPublic(db,path,url){
 const article=path.match(/^\/api\/public\/articles\/([^/]+)$/),media=path.match(/^\/api\/public\/media\/([a-f0-9]{64})$/);
 if(media){
  const row=await db.prepare("SELECT mime,data FROM blobs WHERE hash=? AND EXISTS(SELECT 1 FROM public_blob_refs WHERE hash=?)").bind(media[1],media[1]).first();
  if(!row)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(typeof row.data==="string"?fromBase64(row.data):new Uint8Array(row.data),{headers:{"Content-Type":row.mime,"Cache-Control":"public, max-age=31536000, immutable",ETag:'"'+media[1]+'"'}});
 }
 if(article){
  const row=await db.prepare("SELECT data,etag FROM public_documents WHERE kind='articles' AND id=?").bind(article[1]).first();
  if(!row)return Response.json({error:"文章不存在或尚未公开。"},{status:404,headers:{"Cache-Control":"public, max-age=15"}});
  const comments=await db.prepare("SELECT data FROM public_documents WHERE kind='comments' AND article_id=? ORDER BY key LIMIT 200").bind(article[1]).all();
  const votes=await db.prepare("SELECT up,down FROM vote_totals WHERE article_id=?").bind(article[1]).first()||{up:0,down:0};
  return Response.json({article:JSON.parse(row.data),comments:comments.results.map(r=>JSON.parse(r.data)),votes},{headers:{"Cache-Control":"public, max-age=60",ETag:'"'+row.etag+'"'}});
 }
 if(path==="/api/public/catalog"){
  const cursor=url.searchParams.get("cursor")||"",limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||100));
  const rows=await db.prepare("SELECT p.key,p.summary,p.etag,COALESCE(v.up,0) AS up,COALESCE(v.down,0) AS down FROM public_documents p LEFT JOIN vote_totals v ON v.article_id=p.id WHERE p.kind='articles' AND p.key>? ORDER BY p.key LIMIT ?").bind(cursor,limit+1).all();
  const page=rows.results.slice(0,limit);
  return Response.json({articles:page.map(r=>({...JSON.parse(r.summary),etag:r.etag,votes:{up:r.up,down:r.down}})),next:rows.results.length>limit?page.at(-1).key:null},{headers:{"Cache-Control":"public, max-age=60"}});
 }
 if(path==="/api/public/announcements"){
  const rows=await db.prepare("SELECT data FROM public_documents WHERE kind='announcements' ORDER BY key LIMIT 100").all();
  return Response.json({announcements:rows.results.map(r=>JSON.parse(r.data))},{headers:{"Cache-Control":"public, max-age=60"}});
 }
 return Response.json({error:"接口不存在。"},{status:404});
}
const inflight=new Map();
export async function publicResponse(request,env,ctx){
 const url=canonicalPublicURL(request),key=new Request(url.href,{method:"GET"}),cache=globalThis.caches?.default;
 let response=cache?await cache.match(key):null;
 if(response){response=new Response(response.body,response);response.headers.set("X-NARV-Cache","HIT");return response}
 if(readThrottle(request))return Response.json({error:"请求过于频繁，请稍后再试。"},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
 if(!inflight.has(url.href))inflight.set(url.href,(async()=>{const loaded=await readPublic(env.DB,url.pathname,url);if(cache&&loaded.ok){try{await cache.put(key,loaded.clone())}catch{/* Cache failures must not make public content unavailable. */}}return loaded})().finally(()=>inflight.delete(url.href)));
 response=(await inflight.get(url.href)).clone();response.headers.set("X-NARV-Cache","MISS");
 return response;
}
