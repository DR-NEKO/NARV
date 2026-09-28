export async function loginKeyFor(env,githubId){
 if(!env.IDENTITY_PEPPER||env.IDENTITY_PEPPER.length<32)throw Error("登录隐私密钥尚未配置。");
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.IDENTITY_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const value=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("github:"+githubId)));
 return "ghh:"+[...value].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const windows=new Map();
export function readThrottle(request){
 // Best-effort isolate-local protection, with generous room for campus NAT.
 const ip=request.headers.get("CF-Connecting-IP")||"local",now=Date.now(),key=ip+":"+Math.floor(now/60000);
 if(windows.size>10000)for(const [k,v] of windows)if(v.time<now-120000)windows.delete(k);
 const slot=windows.get(key)||{count:0,time:now};slot.count++;windows.set(key,slot);
 return slot.count>6000;
}
export function canonicalPublicURL(request){
 const url=new URL(request.url),path=url.pathname;
 if(path==="/api/public/catalog"){const cursor=url.searchParams.get("cursor")||"";if(cursor&&(!/^submissions\/[A-Za-z0-9_-]{1,100}$/.test(cursor)))throw Error("目录游标无效。");const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||100));url.search="";url.searchParams.set("limit",String(limit));if(cursor)url.searchParams.set("cursor",cursor)}
 else url.search="";
 return url;
}
