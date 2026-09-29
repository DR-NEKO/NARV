import {me} from "./service.js";
import {loginKeyFor} from "./security.js";
import {withIdentities} from "../public/identity.js";
import {load,save,select,loadKeys} from "./repository.js";
export const random=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...a)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")};
export const hash=async text=>{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")};
async function put(db,kind,key,data,ttl){await db.prepare("INSERT INTO auth(key,kind,data,expires) VALUES(?,?,?,?)").bind(await hash(key),kind,JSON.stringify(data),Date.now()+ttl).run()}
async function peek(db,kind,key){const row=await db.prepare("SELECT data FROM auth WHERE key=? AND kind=? AND expires>?").bind(await hash(key),kind,Date.now()).first();return row?JSON.parse(row.data):null}
async function take(db,kind,key){const row=await db.prepare("DELETE FROM auth WHERE key=? AND kind=? AND expires>? RETURNING data").bind(await hash(key),kind,Date.now()).first();return row?JSON.parse(row.data):null}
export async function userFromRequest(req,env) {
 const token=req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 if(!token)return null;
 const row=await env.DB.prepare("SELECT data FROM auth WHERE key=? AND kind='session' AND expires>?").bind(await hash(token),Date.now()).first();
 return row?JSON.parse(row.data).userId:null;
}
export async function renewSession(req,env,userId){
 if(!userId)return undefined;
 const token=req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)return undefined;
 const now=Date.now(),expires=now+30*86400000;
 const renewed=await env.DB.prepare("UPDATE auth SET expires=? WHERE key=? AND kind='session' AND expires>? AND expires<? AND json_extract(data,'$.userId')=? RETURNING expires").bind(expires,await hash(token),now,now+29*86400000,userId).first();
 return renewed?.expires;
}
export async function newSession(env,userId){const token=random();await put(env.DB,"session",token,{userId},30*86400000);return token}
// Retry only GitHub's read-only profile lookup; an OAuth code must not be spent twice.
async function githubProfile(fetcher,token){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetcher("https://api.github.com/user",{headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","User-Agent":"NARV"},signal:AbortSignal.timeout(12000)});if(r.ok)return await r.json();if(r.status<500)break}catch{}
 }
 throw Error("无法核验 GitHub 账号，请重新登录。");
}
const cookieName=state=>"narv_oauth_"+state.slice(0,16);
const redirect=url=>new Response(null,{status:302,headers:{Location:url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
export async function authRoute(req,env,body,fetcher=fetch) {
 const url=new URL(req.url),base=new URL(env.FRONTEND_URL),api=new URL(env.API_URL);
 if(url.pathname==="/auth/github"){
   if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)throw Error("GitHub 登录尚未配置，请联系站点管理员。");
   const challenge=url.searchParams.get("challenge");if(!/^[A-Za-z0-9_-]{43}$/.test(challenge||""))throw Error("登录校验信息无效。");
   const state=random(),verifier=random(),binding=random();
   await put(env.DB,"oauth",state,{challenge,verifier,binding:await hash(binding)},600000);
   const github=new URL("https://github.com/login/oauth/authorize");
   Object.entries({client_id:env.GITHUB_CLIENT_ID,redirect_uri:new URL("/auth/callback",api).href,state,code_challenge:await hash(verifier),code_challenge_method:"S256"}).forEach(([k,v])=>github.searchParams.set(k,v));
   const response=redirect(github.href);response.headers.set("Set-Cookie",cookieName(state)+"="+binding+"; Path=/auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=600");return response;
 }
 if(url.pathname==="/auth/callback"){
   const state=url.searchParams.get("state");
   if(!/^[A-Za-z0-9_-]{43}$/.test(state||""))throw Error("登录校验失败，请重新登录。");
   const cookies=new Map((req.headers.get("Cookie")||"").split(";").map(x=>x.trim().split("="))),binding=cookies.get(cookieName(state));
   let pending=await peek(env.DB,"oauth",state);
   if(!pending||!binding||await hash(binding)!==pending.binding||!url.searchParams.get("code"))throw Error("登录已过期或校验失败，请从网站重新登录。");
   pending=await take(env.DB,"oauth",state);if(!pending)throw Error("此登录请求已处理，请返回网站。");
   const tokenResponse=await fetcher("https://github.com/login/oauth/access_token",{method:"POST",signal:AbortSignal.timeout(15000),headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get("code"),redirect_uri:new URL("/auth/callback",api).href,code_verifier:pending.verifier})});
   const grant=await tokenResponse.json();if(!tokenResponse.ok||!grant.access_token)throw Error("GitHub 登录失败，请重试。");
   const profile=await githubProfile(fetcher,grant.access_token);if(!Number.isSafeInteger(profile.id))throw Error("无法核验 GitHub 账号。");
   const identityKey=await loginKeyFor(env,profile.id);
   let found=await select(env.DB,"kind='users' AND login_key=?",[identityKey],{limit:1});
   if(!found.length)found=await select(env.DB,"kind='users' AND login_key=?",["github:"+profile.id],{limit:1});
   let before=await loadKeys(env.DB,found.map(r=>r.key)),user=before.state.users[0];
   if(user&&user.loginKey!==identityKey){const after=structuredClone(before.state);Object.assign(after.users[0],withIdentities(after.users[0]),{loginKey:identityKey});await save(env.DB,before,after);user=after.users[0]}
   if(!user){
     const id=crypto.randomUUID(),a=random().slice(0,6),b=random().slice(0,6);
     const designated=String(profile.id)===String(env.ORIGINAL_EDITOR_GITHUB_ID),existsOE=designated?await env.DB.prepare("SELECT id FROM entities WHERE kind=\'users\' AND role=\'original_editor\' LIMIT 1").first():null;const role=designated&&!existsOE?"original_editor":"user";
     user=withIdentities({id,loginKey:identityKey,name:"读者"+a,community:{name:"读者"+a,avatar:"◈"},review:{name:"行者"+b,avatar:"◇"},role});
     const after=structuredClone(before.state);after.users.push(user);try{await save(env.DB,before,after)}catch(error){if(error.status!==409)throw error;const existing=await select(env.DB,"kind='users' AND login_key=?",[identityKey],{limit:1});if(!existing.length)throw error;user=(await loadKeys(env.DB,[existing[0].key])).state.users[0]}
   }
   if(user.accountStatus==="deleting")throw Error("此账号已注销，数据清理尚未完成。");
   const ticket=random();await put(env.DB,"ticket",ticket,{userId:user.id,challenge:pending.challenge},600000);
   base.hash="/auth-complete?ticket="+ticket+"&attempt="+pending.challenge;
   const response=redirect(base.href);response.headers.set("Set-Cookie",cookieName(state)+"=; Path=/auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");return response;
 }
 if(url.pathname==="/auth/exchange"&&req.method==="POST"){
   if(!/^[A-Za-z0-9_-]{43}$/.test(body?.ticket||"")||!/^[A-Za-z0-9_-]{43}$/.test(body?.verifier||""))throw Error("登录交换信息无效。");
   const ticketKey=await hash(body.ticket),item=await peek(env.DB,"ticket",body.ticket);
   if(!item||await hash(body.verifier)!==item.challenge)throw Error("登录凭据已失效，请重新登录。");
   // The PKCE-bound exchange is replayable after a lost response, but mints exactly one
   // session. Only hashes are stored; logout/closure cannot be undone by replay.
   const token=await hash("narv-session-v1:"+body.ticket+":"+body.verifier),sessionHash=await hash(token),expiresAt=Date.now()+30*86400000;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO auth(key,kind,data,expires) SELECT ?,'session',json_object('userId',json_extract(data,'$.userId')),? FROM auth WHERE key=? AND kind='ticket' AND expires>? AND json_extract(data,'$.sessionHash') IS NULL AND EXISTS(SELECT 1 FROM entities WHERE key='users/'||json_extract(auth.data,'$.userId') AND COALESCE(json_extract(head,'$.accountStatus'),'active')!='deleting')").bind(sessionHash,expiresAt,ticketKey,Date.now()),
    env.DB.prepare("UPDATE auth SET data=json_set(data,'$.sessionHash',?) WHERE key=? AND kind='ticket' AND expires>? AND json_extract(data,'$.sessionHash') IS NULL").bind(sessionHash,ticketKey,Date.now())
   ]);
   const session=await env.DB.prepare("SELECT expires FROM auth WHERE key=? AND kind='session' AND expires>?").bind(sessionHash,Date.now()).first();
   if(!session)throw Error("登录会话已失效，请重新登录。");
   return Response.json({token,expiresAt:session.expires,profile:await me(env,item.userId)});
 }
 if(url.pathname==="/auth/logout"&&req.method==="POST"){
   const token=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
   await env.DB.prepare("DELETE FROM auth WHERE key=? AND kind='session'").bind(await hash(token)).run();
   return Response.json({ok:true});
 }
 return null;
}
