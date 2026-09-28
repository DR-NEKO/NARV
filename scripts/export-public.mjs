import {mkdir,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
export async function exportPublic(api,directory){
 const content=path.resolve(directory,"content");if(path.dirname(content)!==path.resolve(directory))throw Error("Invalid output path");await rm(content,{recursive:true,force:true});await mkdir(path.join(content,"articles"),{recursive:true});await mkdir(path.join(content,"media"),{recursive:true});await mkdir(path.join(content,"search"),{recursive:true});
 async function get(url){let error;for(let n=0;n<3;n++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error("Public export HTTP "+r.status);return r}catch(e){error=e}}throw error}
 const catalog=[];let cursor="";
 do{const p=await (await get(api+"/api/public/catalog?limit=100"+(cursor?"&cursor="+encodeURIComponent(cursor):""))).json();catalog.push(...p.articles);cursor=p.next||""}while(cursor);
 const media=new Map(),documents=new Array(catalog.length);
 async function image(value){
  if(typeof value!=="string"||!value.startsWith(api+"/api/public/media/"))return value;
  const hash=value.slice(value.lastIndexOf("/")+1);if(!/^[a-f0-9]{64}$/.test(hash))throw Error("Invalid public media hash");
  if(!media.has(hash))media.set(hash,(async()=>{const r=await get(value),bytes=Buffer.from(await r.arrayBuffer());if(createHash("sha256").update(bytes).digest("hex")!==hash)throw Error("Media hash mismatch");const type=r.headers.get("content-type"),extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[type];if(!extension)throw Error("Unexpected public image type");const file="content/media/"+hash+"."+extension;await writeFile(path.join(directory,file),bytes);return "./"+file})());
  return media.get(hash);
 }
 let cursorIndex=0;
 async function worker(){for(;;){const i=cursorIndex++;if(i>=catalog.length)return;const id=catalog[i].id;if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error("Invalid article ID");const doc=await (await get(api+"/api/public/articles/"+id)).json();
  for(const key of ["authorId","loginKey","identity","reviews","appeals","role"])if(Object.hasOwn(doc.article,key))throw Error("Private field in public export");
  doc.article.avatar=await image(doc.article.avatar);for(const [key,value] of Object.entries(doc.article.images||{}))doc.article.images[key]=await image(value);
  for(const c of doc.comments){if(Object.hasOwn(c,"authorId")||Object.hasOwn(c,"reviewedBy"))throw Error("Private comment field");c.avatar=await image(c.avatar)}
  await writeFile(path.join(content,"articles",id+".json"),JSON.stringify(doc));documents[i]=doc;
 }}
 await Promise.all(Array.from({length:3},worker));
 const shards=[];for(let i=0;i<documents.length;i+=50){const group=documents.slice(i,i+50),name="./content/search/"+String(i/50)+".json";const value={articles:group.map(d=>({...d.article,images:{}})),comments:group.flatMap(d=>d.comments)};await writeFile(path.join(directory,name.slice(2)),JSON.stringify(value));shards.push(name)}
 const notices=await(await get(api+"/api/public/announcements")).json();
 const manifest={version:1,generatedAt:new Date().toISOString(),articles:documents.map(d=>{const {content:body,images,...a}=d.article;return {...a,content:"",images:{},votes:d.votes}}),announcements:notices.announcements,search:shards,media:await Promise.all([...media].map(async([hash,file])=>[hash,await file]))};
 await writeFile(path.join(content,"catalog.json"),JSON.stringify(manifest));
 console.log("Exported "+documents.length+" public articles and "+media.size+" unique media files to Pages.");
 return manifest;
}
