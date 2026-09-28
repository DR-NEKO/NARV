import {publicArticle} from "./identity.js";
import {QueryClient} from "./vendor/query-core/index.mjs";
import * as local from "./store.js";
import {config} from "./config.js";
import {metrics} from "./governance.js";
export const remote=config.mode==="remote";
const empty=()=>({user:null,users:[],submissions:[],articles:[],comments:[],myComments:[],applications:[],bookmarks:[],notifications:[],announcements:[],identityAudits:[],accountEvents:[],metrics:{},voteTotals:{},reports:[],scores:[],points:0,recordVersions:{},revision:0,unread:0});
let cache=empty(),manifest=null,publicLoaded=false,searchLoaded=false,meLoaded=false,readyRoute="",pending=false,lastSession=null;
const deletedDrafts=new Set(),routes=new Map(),details=new Map(),inflight=new Map(),base=config.apiBase?.replace(/\/$/,""),sessionKey="narv-api-session";
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:60000,gcTime:300000,retry:0,networkMode:"always"}}});
const route=()=>new URL(location.hash.slice(1)||"/","https://narv.local");
const resourceKey=u=>u.pathname==="/messages"?"/messages?page="+(u.searchParams.get("page")||1):u.pathname==="/workspace/posts"?"/workspace"+u.search:u.pathname+u.search;
async function workspaceData(u,{force=false}={}){
 const queryKey=["workspace",sessionStorage.getItem(sessionKey)?.slice(-16)||"",resourceKey(u)];
 if(force)await queryClient.invalidateQueries({queryKey,exact:true,refetchType:"none"});
 const [name,tabName]=u.pathname.slice(1).split("/"),tab=name==="messages"?"messages":name==="announcements"?"announcements":tabName==="posts"?"":tabName||"";
 return queryClient.fetchQuery({queryKey,queryFn:()=>request("/api/workspace?tab="+encodeURIComponent(tab)+"&page="+(u.searchParams.get("page")||1)+"&q="+encodeURIComponent(u.searchParams.get("q")||"")+"&side="+encodeURIComponent(u.searchParams.get("side")||"review")+"&reason="+encodeURIComponent(u.searchParams.get("reason")||""))});
}

const hintsKey="narv-own-view-v1";
function persistHints(){
 if(!cache.user||!meLoaded)return;const token=sessionStorage.getItem(sessionKey);if(!token)return;
 const core=routes.get("/workspace")?.data,own=core?{...core,users:[cache.user],user:cache.user,submissions:core.submissions.filter(s=>s.authorId===cache.user.id).map(s=>({...s,content:"",images:{},workingDraft:undefined,history:[],versions:s.versions.map(v=>({version:v.version,title:v.title,date:v.date}))})),comments:[],myComments:[],applications:[],reports:[],scores:[],identityAudits:[],accountEvents:[],notifications:[],announcements:[],metrics:{[cache.user.id]:core.metrics[cache.user.id]},recordVersions:Object.fromEntries(Object.entries(core.recordVersions).filter(([k])=>k==="users/"+cache.user.id||k.startsWith("submissions/")&&core.submissions.some(s=>s.id===k.slice(12)&&s.authorId===cache.user.id)))}:null;
 if(own){own.recordVersions["users/"+cache.user.id]=cache.recordVersions["users/"+cache.user.id];own.articles=own.articles.map(a=>({...a,content:"",images:{}}))}
 const text=JSON.stringify({sessionHint:token.slice(-16),time:Date.now(),user:cache.user,points:cache.points,unread:cache.unread,messages:routes.get("/messages?page=1")?.data||null,own});
 if(text.length<700000)try{sessionStorage.setItem(hintsKey,text)}catch{}
}
function restoreHints(){try{const token=sessionStorage.getItem(sessionKey),hint=JSON.parse(sessionStorage.getItem(hintsKey)||"null");if(!token||!hint||hint.sessionHint!==token.slice(-16)||Date.now()-hint.time>60000){sessionStorage.removeItem(hintsKey);return}lastSession=token;cache.user=hint.user;cache.users=[hint.user];cache.points=hint.points;cache.unread=hint.unread;if(hint.messages){routes.set("/messages?page=1",{time:hint.time,data:hint.messages});cache.notifications=hint.messages.notifications||[]}if(hint.own){routes.set("/workspace",{time:hint.time,data:hint.own});mergePrivate(hint.own)}}catch{sessionStorage.removeItem(hintsKey)}}
export const publicReady=()=>!remote||publicLoaded;
export const searchReady=()=>!remote||searchLoaded;
export const authPending=()=>remote&&!!sessionStorage.getItem(sessionKey)&&!cache.user;
restoreHints();

async function request(path,body,{anonymous=false}={}){
 const token=anonymous?null:sessionStorage.getItem(sessionKey);
 const res=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:anonymous?"default":"no-store"});
 const data=await res.json();if(!anonymous&&token!==sessionStorage.getItem(sessionKey)){const e=Error("登录状态已变化，请重新打开当前页面。");e.status=499;throw e}if(!res.ok){if(res.status===401){sessionStorage.removeItem(sessionKey);clearPrivate()}const e=Error(data.error||"服务暂时无法连接。");e.status=res.status;throw e}return data;
}
function mergeArticles(articles){const all=new Map(cache.articles.map(a=>[a.id,a]));for(const a of articles){const old=all.get(a.id);all.set(a.id,{...old,...a,...(!a.content&&old?.content?{content:old.content}:{}),...(!Object.keys(a.images||{}).length&&old?.images?{images:old.images}:{})})}cache.articles=[...all.values()]}
async function publicLoad(){
 if(publicLoaded)return;
 try{const response=await fetch("./content/catalog.json",{cache:"default"});if(!response.ok)throw Error("No static snapshot");manifest=await response.json();mergeArticles(manifest.articles);cache.announcements=manifest.announcements;for(const a of manifest.articles)cache.voteTotals[a.id]={...a.votes,mine:0}}
 catch{let cursor="";do{const data=await request("/api/public/catalog?limit=100"+(cursor?"&cursor="+encodeURIComponent(cursor):""),undefined,{anonymous:true});mergeArticles(data.articles.map(a=>({...a,content:"",images:{}})));for(const a of data.articles)cache.voteTotals[a.id]={...a.votes,mine:0};cursor=data.next||""}while(cursor);cache.announcements=(await request("/api/public/announcements",undefined,{anonymous:true})).announcements}
 publicLoaded=true;document.dispatchEvent(new Event("narv:public-ready"));
}
async function profile({force=false}={}){
 const token=sessionStorage.getItem(sessionKey);if(token!==lastSession){clearPrivate();lastSession=token}
 if(!sessionStorage.getItem(sessionKey)){if(cache.user)clearPrivate();meLoaded=true;return}
 if(meLoaded&&!force)return;
 const data=await request("/api/me");if(!data.user){sessionStorage.removeItem(sessionKey);clearPrivate();meLoaded=true;return}if(cache.user&&(cache.user.id!==data.user?.id||cache.user.role!==data.user?.role))clearPrivate();cache.user=data.user;cache.users=data.user?[data.user]:[];cache.unread=data.unread||0;cache.points=data.points||0;Object.assign(cache.recordVersions,data.recordVersions);meLoaded=true;persistHints();void prefetchWorkspace("#/messages").catch(()=>{});
}
function mergePrivate(data){
 const older=(data.revision??-1)<cache.revision;
 if(older)for(const [name,kind] of [["submissions","submissions"],["comments","comments"],["myComments","comments"]])if(data[name]){
  const rows=new Map(data[name].map(x=>[x.id,x]));for(const item of cache[name])if((cache.recordVersions[kind+"/"+item.id]||0)>(data.recordVersions?.[kind+"/"+item.id]||0))rows.set(item.id,item);data={...data,[name]:[...rows.values()]};
 }

 mergeArticles(data.articles||[]);
 if(data.submissions)data={...data,submissions:data.submissions.filter(s=>!deletedDrafts.has(s.id)).map(s=>{const key="submissions/"+s.id;return (data.recordVersions?.[key]||0)<(cache.recordVersions[key]||0)?cache.submissions.find(x=>x.id===s.id)||s:s})};
 if(data.comments)data={...data,comments:data.comments.map(c=>(data.recordVersions?.["comments/"+c.id]||0)<(cache.recordVersions["comments/"+c.id]||0)?cache.comments.find(x=>x.id===c.id)||c:c)};

 for(const name of ["submissions","users","myComments","applications","notifications","identityAudits","accountEvents","reports","scores","memberResults"]){if(Object.hasOwn(data,name))cache[name]=data[name]};
 cache.points=data.points??cache.points;if(data.user&&(!cache.user||(data.recordVersions?.["users/"+data.user.id]||0)>=(cache.recordVersions["users/"+data.user.id]||0)))cache.user=data.user;cache.unread=data.unread??cache.unread;cache.revision=Math.max(data.revision||0,cache.revision);cache.bookmarks=data.bookmarks||cache.bookmarks;
 const comments=new Map(cache.comments.filter(c=>c.status==="published"&&!c.authorId).map(c=>[c.id,c]));for(const c of data.comments||[])comments.set(c.id,c);cache.comments=[...comments.values()];
 const notices=new Map(cache.announcements.map(a=>[a.id,a]));for(const a of data.announcements||[])notices.set(a.id,a);cache.announcements=[...notices.values()];
 Object.assign(cache.metrics,data.metrics||{});for(const [key,value] of Object.entries(data.recordVersions||{}))cache.recordVersions[key]=Math.max(value,cache.recordVersions[key]||0);if(!older)Object.assign(cache.voteTotals,data.voteTotals||{});
}
function staticMedia(value){if(typeof value!=="string")return value;const hash=value.match(/\/api\/public\/media\/([a-f0-9]{64})$/)?.[1];return hash?new Map(manifest?.media||[]).get(hash)||value:value}
async function article(id,{force=false}={}){
 const key="article/"+id,cached=routes.get(key);if(cached&&!force&&Date.now()-cached.time<60000)return;
 let doc;
 if(!force){try{const r=await fetch("./content/articles/"+encodeURIComponent(id)+".json");if(r.ok)doc=await r.json()}catch{}}
 {try{doc=await request("/api/public/articles/"+encodeURIComponent(id),undefined,{anonymous:true})}catch(error){if(error.status===404){cache.articles=cache.articles.filter(a=>a.id!==id);cache.comments=cache.comments.filter(c=>c.articleId!==id);routes.delete(key)}throw error}}
 doc.article.avatar=staticMedia(doc.article.avatar);for(const key of Object.keys(doc.article.images||{}))doc.article.images[key]=staticMedia(doc.article.images[key]);for(const c of doc.comments)c.avatar=staticMedia(c.avatar);
 mergeArticles([doc.article]);cache.comments=[...cache.comments.filter(c=>c.articleId!==id||c.authorId),...doc.comments];if(!cache.user||!cache.voteTotals[id])cache.voteTotals[id]={...doc.votes,mine:0};
 if(cache.user&&route().pathname==="/article/"+id){const state=await request("/api/article-state/"+encodeURIComponent(id));if(route().pathname==="/article/"+id)mergePrivate(state)}
 routes.set(key,{time:Date.now()});
}
export async function ensureSearch(){
 if(!remote||searchLoaded)return;
 if(inflight.has("search"))return inflight.get("search");
 const work=(async()=>{await publicLoad();if(manifest){for(const file of manifest.search){const r=await fetch(file);if(!r.ok)throw Error("搜索索引暂时无法读取。");const data=await r.json();for(const a of data.articles){if(!routes.has("article/"+a.id))mergeArticles([a])}const comments=new Map(cache.comments.map(c=>[c.id,c]));for(const c of data.comments)if(!routes.has("article/"+c.articleId))comments.set(c.id,c);cache.comments=[...comments.values()]}}
 else for(const a of [...cache.articles])await article(a.id);searchLoaded=true;document.dispatchEvent(new Event("narv:public-ready"))})();
 inflight.set("search",work);try{await work}finally{inflight.delete("search")}
}
function warm(u){if(u.pathname==="/workspace/profile"||u.pathname==="/submit")return !!cache.user;if(u.pathname.startsWith("/workspace")||u.pathname==="/messages"||u.pathname==="/announcements")return routes.has(resourceKey(u));if(u.pathname.startsWith("/member/"))return !!cache.member&&cache.member.id===u.pathname.split("/")[2];if(u.pathname.startsWith("/submission/")||u.pathname.startsWith("/edit/"))return details.has(u.pathname.split("/")[2]);return false}
export const routeLoading=()=>remote&&inflight.has(resourceKey(route()))&&!warm(route());
export async function refresh({force=false}={}){
 if(!remote)return;
 const current=route(),key=resourceKey(current);
 if(sessionStorage.getItem(sessionKey)!==lastSession){clearPrivate();lastSession=sessionStorage.getItem(sessionKey)}
 if(readyRoute===key&&!force)return;
 const cachedRoute=routes.get(key);if(cachedRoute&&!force){mergePrivate(cachedRoute.data);if(Date.now()-cachedRoute.time<60000){readyRoute=key;if(!meLoaded)profile().then(()=>document.dispatchEvent(new Event("narv:session-ready"))).catch(()=>{});return}}

 if(inflight.has(key)){const previous=inflight.get(key);if(!force)return previous;try{await previous}catch{}return refresh({force:true})}
 const work=(async()=>{const [name,id]=current.pathname.slice(1).split("/");await Promise.all([["workspace","messages","member","report","submission","edit","submit"].includes(name)?Promise.resolve():publicLoad(),profile().catch(error=>{if(["workspace","submission","edit","submit","report","messages"].includes(name))throw error})]);
 if(name==="workspace"||name==="messages"||name==="announcements"){
 if(cache.user&&!(name==="workspace"&&id==="profile")){const cached=routes.get(key);const tab=name==="messages"?"messages":name==="announcements"?"announcements":id==="posts"?"":id||"";let data=cached?.data;
 if(force||!data||Date.now()-cached.time>60000){data=await workspaceData(current,{force});routes.set(key,{time:Date.now(),data})}if(resourceKey(route())===key){mergePrivate(data);persistHints()}}
 }else if(["submission","edit"].includes(name)&&cache.user){let data=details.get(id);if(force||!data||Date.now()-data.time>30000){data={...await request("/api/submissions/"+encodeURIComponent(id)),time:Date.now()};details.set(id,data)}if(deletedDrafts.has(id)||(data.recordVersion||0)<(cache.recordVersions["submissions/"+id]||0))return;cache.submissions=[...cache.submissions.filter(s=>s.id!==id),data.submission];cache.recordVersions["submissions/"+id]=data.recordVersion;Object.assign(cache.metrics,data.metrics)}
 else if(name==="member"&&cache.user){const data=await request("/api/members/"+encodeURIComponent(id));if(route().pathname!==current.pathname)return;cache.member=data.member;cache.memberArticles=data.articles;cache.metrics[id]={...cache.metrics[id],points:data.points};cache.users=[...cache.users.filter(x=>x.id!==id),data.member];cache.recordVersions["users/"+id]=data.recordVersion}
 else if(name==="report"&&cache.user){const data=await request("/api/reports/"+encodeURIComponent(id));cache.reports=[...cache.reports.filter(r=>r.id!==id),data.report];cache.recordVersions["reports/"+id]=data.recordVersion}
 else if(name==="article")await article(id,{force});else if(name==="search")await ensureSearch();
 if(resourceKey(route())===key)readyRoute=key;})();inflight.set(key,work);pending=true;
 try{await work}finally{inflight.delete(key);pending=inflight.size>0}
}
export async function initialize(){
 if(!remote)return;if(!base)throw Error("API 地址尚未配置。");
 const url=route();if(url.pathname==="/auth-complete"){const ticket=url.searchParams.get("ticket"),verifier=sessionStorage.getItem("narv-login-verifier");history.replaceState(null,"",location.pathname+location.search+"#/login");try{const data=await request("/auth/exchange",{ticket,verifier});sessionStorage.setItem(sessionKey,data.token);location.hash="#/"+(sessionStorage.getItem("narv-next")||"workspace")}finally{sessionStorage.removeItem("narv-login-verifier")}}
 await refresh();
}
export async function login(){const bytes=crypto.getRandomValues(new Uint8Array(32)),verifier=btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");sessionStorage.setItem("narv-login-verifier",verifier);const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");location.assign(base+"/auth/github?challenge="+challenge)}
function clearPrivate(){const pub={articles:cache.articles,comments:cache.comments.filter(c=>c.status==="published"&&!c.authorId),announcements:cache.announcements.filter(a=>a.audience==="public")};cache={...empty(),...pub};queryClient.clear();routes.clear();details.clear();deletedDrafts.clear();readyRoute="";meLoaded=false;sessionStorage.removeItem(hintsKey)}
export async function logout(){if(!remote){local.saveSession(null);return}const token=sessionStorage.getItem(sessionKey);sessionStorage.removeItem(sessionKey);clearPrivate();if(token)void fetch(base+"/auth/logout",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"}).catch(()=>{});}

export async function prefetchWorkspace(href){
 if(!remote||!cache.user)return;const u=new URL(href.replace(/^#/,""),"https://narv.local"),key=resourceKey(u);if(u.pathname==="/workspace/profile"||routes.has(key)||inflight.has(key))return;
 const tab=u.pathname.split("/")[2]||"",work=workspaceData(u).then(data=>{routes.set(key,{time:Date.now(),data});persistHints();if(resourceKey(route())===key){mergePrivate(data);persistHints();document.dispatchEvent(new Event("narv:refresh"))}});
 inflight.set(key,work);try{await work}finally{if(inflight.get(key)===work)inflight.delete(key)}
}
function applyResult(name,args,response){
 if(response.revision<cache.revision)return response.result;cache.revision=response.revision;
 if(response.profile){if(cache.user&&cache.user.role!==response.profile.user.role)clearPrivate();cache.user=response.profile.user;cache.points=response.profile.points;cache.unread=response.profile.unread;cache.users=[cache.user,...cache.users.filter(x=>x.id!==cache.user.id)];meLoaded=true}
 Object.assign(cache.recordVersions,response.recordVersions||{});
 let result=response.result;
 if(["create","action","resubmit"].includes(name)){
 const old=cache.submissions.find(s=>s.id===result.id)||{},input=name==="create"?args[0]:name==="resubmit"?{}:args[2]||{};
 if(result.publicSnapshot)result.publicSnapshot={...old.publicSnapshot,...result.publicSnapshot,content:old.publicSnapshot?.content||old.content||cache.articles.find(a=>a.id===result.id)?.content||"",images:old.publicSnapshot?.images||old.images||{}};
 result={...old,...result,images:result.workingDraft&&args[1]==="save"?old.images||{}:input.images||old.images||{},...(result.workingDraft?{workingDraft:{...result.workingDraft,images:input.images||old.workingDraft?.images||old.images||{}}}:{})};
 if((["published","retracted"].includes(result.status)||result.publicSnapshot)&&!["ban","temporary_down"].includes(result.moderation?.kind))mergeArticles([{...publicArticle(result),isLocal:false}]);cache.submissions=[...cache.submissions.filter(s=>s.id!==result.id),result];details.set(result.id,{submission:result,recordVersion:cache.recordVersions["submissions/"+result.id],time:Date.now()});
 }
 if(name==="resubmit")details.delete(result.id);
 if(name==="suspendAccount"&&result){cache.users=[...cache.users.filter(x=>x.id!==result.id),result];if(cache.member?.id===result.id)cache.member=result}
 if(name==="removeContent"){deletedDrafts.add(args[1]);cache.submissions=cache.submissions.filter(s=>s.id!==args[1]);cache.articles=cache.articles.filter(a=>a.id!==args[1]);cache.comments=cache.comments.filter(c=>c.id!==args[1]);details.delete(args[1])}
 if(name==="deleteDraft"){deletedDrafts.add(args[0]);cache.submissions=cache.submissions.filter(s=>s.id!==args[0]);details.delete(args[0]);localStorage.removeItem(draftKey(cache.user,args[0]))}
 if(name==="toggleBookmark"){const id=args[0];cache.bookmarks=!result.bookmarked?cache.bookmarks.filter(b=>b.articleId!==id):[...cache.bookmarks,{userId:cache.user.id,articleId:id,date:new Date().toISOString()}]}
 if(name==="vote")cache.voteTotals[args[0]]={up:result.up,down:result.down,mine:result.mine};
 if(["addComment","moderateComment","editComment","withdrawComment"].includes(name)&&result){cache.comments=[...cache.comments.filter(c=>c.id!==result.id),result];if(result.authorId===cache.user.id)cache.myComments=[...cache.myComments.filter(c=>c.id!==result.id),result]}
 if(["report","claimAccountability","resolveAccountability"].includes(name)&&result)cache.reports=[...cache.reports.filter(r=>r.id!==result.id),result];
 if(name==="markRead")cache.notifications=cache.notifications.map(n=>args[0]==="all"||n.id===args[0]?{...n,read:true}:n);
 void queryClient.invalidateQueries({queryKey:["workspace"],refetchType:"none"});for(const entry of routes.values()){entry.time=0;if(!entry.data)continue;if(["create","action","resubmit"].includes(name)){const items=entry.data.submissions||[];entry.data.submissions=[...items.filter(s=>s.id!==result.id),result]}if(["addComment","moderateComment","editComment","withdrawComment"].includes(name)&&result){entry.data.comments=(entry.data.comments||[]).filter(c=>c.id!==result.id);if(result.status==="pending")entry.data.comments.push(result);entry.data.myComments=cache.myComments}
 if(name==="removeContent"){entry.data.submissions=(entry.data.submissions||[]).filter(s=>s.id!==args[1]);entry.data.comments=(entry.data.comments||[]).filter(c=>c.id!==args[1])}if(name==="deleteDraft")entry.data.submissions=(entry.data.submissions||[]).filter(s=>s.id!==args[0]);entry.data.user=cache.user;entry.data.recordVersions={...entry.data.recordVersions,...cache.recordVersions}}readyRoute="";persistHints();return result;
}
async function mutate(name,args){
 document.dispatchEvent(new CustomEvent("narv:operation",{detail:{name}}));
 try{const response=await request("/api/command",{name,args,recordVersions:cache.recordVersions}),result=applyResult(name,args,response);
 // Acknowledge the committed write immediately; background reads never delay the toast.
 setTimeout(()=>{const current=route();if(name==="deleteDraft"&&current.pathname.startsWith("/submission/"))return;refresh({force:true}).then(()=>{if(!["/submit","/edit","/workspace/profile"].some(p=>route().pathname===p||p==="/edit"&&route().pathname.startsWith(p+"/")))document.dispatchEvent(new Event("narv:refresh"))}).catch(()=>{})},0);
 return result}catch(error){readyRoute="";setTimeout(()=>refresh({force:true}).catch(()=>{}),0);throw error}
}
export const memberInfo=()=>remote?cache.member:null;
export const memberArticles=()=>remote?cache.memberArticles||[]:[];
export const resubmit=(u,...args)=>remote?mutate("resubmit",args):local.resubmit(u,...args);
export const suspendAccount=(u,...args)=>remote?mutate("suspendAccount",args):local.suspendAccount(u,...args);
export const removeContent=(u,...args)=>remote?mutate("removeContent",args):local.removeContent(u,...args);
export const transferOE=(u,...args)=>remote?mutate("transferOE",args):local.transferOE(u,...args);
export async function closeAccount(targetId){if(!remote)throw Error("账号注销仅在线上服务执行。");const first=await request("/api/account-confirm",{targetId,firstConfirmation:true});const uid=prompt(first.notice+"\n\n第二次确认：请输入目标账号社区 UID "+first.uid);if(uid===null)return false;if(uid!==first.uid)throw Error("UID 不匹配，未执行注销。");const result=await request("/api/account-close",{challenge:first.challenge,uid,secondConfirmation:true});if(result.self){const prefix="narv-remote-draft:narv-compose-v2:"+cache.user.id+":";for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);sessionStorage.removeItem(sessionKey);clearPrivate();cache.articles=[];cache.comments=[];manifest=null;publicLoaded=false;searchLoaded=false;location.hash="#/"}else{routes.clear();queryClient.clear();location.hash="#/workspace/members"}return true}
export const deleteDraft=(u,id)=>remote?mutate("deleteDraft",[id]):local.deleteDraft(u,id);

export const session=()=>remote?cache.user:local.session();
export const members=()=>remote?cache.memberResults||[]:local.accounts().filter(u=>{const p=route().searchParams,side=p.get("side")==="community"?"community":"review",q=(p.get("q")||"").toLowerCase();return !q||u[side]?.name.toLowerCase().includes(q)||u[side]?.uid.toLowerCase()===q});
export const accounts=()=>remote?cache.users:local.accounts();
export const account=id=>accounts().find(u=>u.id===id);
export const saveSession=u=>{if(remote)throw Error("线上账号需通过 GitHub 登录。");return local.saveSession(u)};
export const all=()=>remote?cache.submissions:local.all();
export const list=u=>remote?cache.submissions:local.list(u);
export const get=(id,u)=>remote?cache.submissions.find(s=>s.id===id):local.get(id,u);
export const publicArticles=()=>remote?cache.articles:local.publicArticles();
export const comments=(id,u)=>remote?cache.comments.filter(c=>(!id||c.articleId===id)&&(u||c.status==="published")):local.comments(id,u);
export const myComments=u=>remote?cache.myComments:local.myComments(u);
export const applications=u=>remote?cache.applications:local.applications(u);
export const bookmarks=u=>remote?cache.bookmarks:local.bookmarks(u);
export const notifications=u=>remote?cache.notifications:local.notifications(u);
export const unread=u=>remote?cache.unread:local.unread(u);
export const announcements=u=>remote?cache.announcements:local.announcements(u);
export const identityAudits=u=>remote?cache.identityAudits:local.identityAudits(u);
export const userMetrics=id=>remote?cache.metrics[id]||metrics({id},[]):local.userMetrics(id);
export const votes=(id,u)=>remote?cache.voteTotals[id]||{up:0,down:0,mine:0}:local.votes(id,u);
export const draftKey=(u,id)=>(remote?"narv-remote-draft:":"")+local.draftKey(u,id);
export const create=(u,d)=>remote?mutate("create",[d]):local.create(u,d);
export const action=(id,verb,u,d)=>remote?mutate("action",[id,verb,d]):local.action(id,verb,u,d);
export const version=(id,number,u)=>remote?request("/api/submissions/"+encodeURIComponent(id)+"?version="+number):local.get(id,u).versions.find(v=>v.version===number);

export const addComment=(u,...args)=>remote?mutate("addComment",args):local.addComment(u,...args);
export const moderateComment=(u,...args)=>remote?mutate("moderateComment",args):local.moderateComment(u,...args);
export const editComment=(u,...args)=>remote?mutate("editComment",args):local.editComment(u,...args);
export const withdrawComment=(u,...args)=>remote?mutate("withdrawComment",args):local.withdrawComment(u,...args);
export const apply=(u,...args)=>remote?mutate("apply",args):local.apply(u,...args);
export const endorse=(u,...args)=>remote?mutate("endorse",args):local.endorse(u,...args);
export const promote=(u,...args)=>remote?mutate("promote",args):local.promote(u,...args);
export const markRead=(u,...args)=>remote?mutate("markRead",args):local.markRead(u,...args);
export const announce=(u,...args)=>remote?mutate("announce",args):local.announce(u,...args);
export const archiveAnnouncement=(u,...args)=>remote?mutate("archiveAnnouncement",args):local.archiveAnnouncement(u,...args);
export const updateProfiles=(u,...args)=>remote?mutate("updateProfiles",args):local.updateProfiles(u,...args);
export const revealIdentity=(u,...args)=>remote?mutate("revealIdentity",args):local.revealIdentity(u,...args);
export const toggleBookmark=(u,...args)=>remote?mutate("toggleBookmark",args):local.toggleBookmark(u,...args);
export const vote=(u,...args)=>remote?mutate("vote",args):local.vote(u,...args);
export const accountEvents=u=>remote?cache.accountEvents:local.state().accountEvents;
export const reports=u=>remote?cache.reports:local.reports(u);
export const scores=u=>remote?cache.scores:local.scores(u);
export const points=u=>remote?cache.points:local.userMetrics(u?.id).points||0;
export const report=(u,...args)=>remote?mutate("report",args):local.report(u,...args);
export const claimAccountability=(u,...args)=>remote?mutate("claimAccountability",args):local.claimAccountability(u,...args);
export const resolveAccountability=(u,...args)=>remote?mutate("resolveAccountability",args):local.resolveAccountability(u,...args);
