const encoder=new TextEncoder(),decoder=new TextDecoder();
export const toBase64=bytes=>{if(bytes.toBase64)return bytes.toBase64();let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)};
export const fromBase64=value=>{if(Uint8Array.fromBase64)return Uint8Array.fromBase64(value);const text=atob(value),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return bytes};
export const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function compress(text){
 const bytes=encoder.encode(text);if(bytes.length<1024)return text;
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),gzip=new Uint8Array(await new Response(stream).arrayBuffer()),encoded="gz:"+toBase64(gzip);
 return encoded.length<bytes.length?encoded:text;
}
export async function decompress(text){
 if(!text.startsWith("gz:"))return text;
 return decoder.decode(await new Response(new Blob([fromBase64(text.slice(3))]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}
export function references(value,result=new Set()){
 if(value&&typeof value==="object"){if(typeof value.$narvBlob==="string")result.add(value.$narvBlob);else for(const v of Object.values(value))references(v,result)}return result;
}
export function codecPlan(){
 const images=new Map(),blobs=new Map();
 async function pack(value){
  if(typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)){
   if(images.has(value))return images.get(value);
   const mime=value.slice(5,value.indexOf(";")),data=fromBase64(value.slice(value.indexOf(",")+1)),hash=await digest(data);
   const marker={$narvBlob:hash};images.set(value,marker);blobs.set(hash,{hash,mime,data,bytes:data.length});return marker;
  }
  if(Array.isArray(value)){const result=[];for(const v of value)result.push(await pack(v));return result}
  if(value&&typeof value==="object"){const result={};for(const [k,v] of Object.entries(value))result[k]=await pack(v);return result}
  return value;
 }
 return {pack,blobs};
}
export async function hydrate(db,value){
 const hashes=[...references(value)];if(!hashes.length)return value;
 const rows=await db.prepare("SELECT hash,mime,data FROM blobs WHERE hash IN (SELECT value FROM json_each(?))").bind(JSON.stringify(hashes)).all();
 const images=new Map(rows.results.map(r=>[r.hash,"data:"+r.mime+";base64,"+(typeof r.data==="string"?r.data:toBase64(new Uint8Array(r.data)))]));
 function visit(v){if(v&&typeof v==="object"){if(v.$narvBlob){if(!images.has(v.$narvBlob))throw Error("图片附件缺失。");return images.get(v.$narvBlob)}if(Array.isArray(v))return v.map(visit);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]))}return v}
 return visit(value);
}
