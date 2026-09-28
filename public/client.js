import * as local from "./store.js";
import {config} from "./config.js";
import {metrics} from "./governance.js";
export const remote=config.mode==="remote";
const empty=()=>({user:null,users:[],submissions:[],articles:[],comments:[],myComments:[],applications:[],bookmarks:[],notifications:[],announcements:[],identityAudits:[],accountEvents:[],metrics:{},voteTotals:{},reports:[],scores:[],points:0,recordVersions:{},revision:0,unread:0});
let cache=empty(),manifest=null,publicLoaded=false,searchLoaded=false,meLoaded=false,readyRoute="",pending=false,lastSession=null;
const routes=new Map(),details=new Map(),inflight=new Map(),base=config.apiBase?.replace(/\/$/,""),sessionKey="narv-api-session";
const route=()=>new URL(location.hash.slice(1)||"/","https://narv.local");
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
 publicLoaded=true;
}
async function profile({force=false}={}){
 const token=sessionStorage.getItem(sessionKey);if(token!==lastSession){clearPrivate();lastSession=token}
 if(!sessionStorage.getItem(sessionKey)){if(cache.user)clearPrivate();meLoaded=true;return}
 if(meLoaded&&!force)return;
 const data=await request("/api/me");cache.user=data.user;cache.users=data.user?[data.user]:[];cache.unread=data.unread||0;cache.points=data.points||0;Object.assign(cache.recordVersions,data.recordVersions);meLoaded=true;
}
function mergePrivate(data){
 mergeArticles(data.articles||[]);
 for(const name of ["submissions","users","myComments","applications","notifications","identityAudits","accountEvents","reports","scores"]){if(Object.hasOwn(data,name))cache[name]=data[name]};
 cache.points=data.points??cache.points;cache.user=data.user||cache.user;cache.revision=data.revision||cache.revision;cache.bookmarks=data.bookmarks||cache.bookmarks;
 const comments=new Map(cache.comments.filter(c=>c.status==="published"&&!c.authorId).map(c=>[c.id,c]));for(const c of data.comments||[])comments.set(c.id,c);cache.comments=[...comments.values()];
 const notices=new Map(cache.announcements.map(a=>[a.id,a]));for(const a of data.announcements||[])notices.set(a.id,a);cache.announcements=[...notices.values()];
 Object.assign(cache.metrics,data.metrics||{});Object.assign(cache.recordVersions,data.recordVersions||{});Object.assign(cache.voteTotals,data.voteTotals||{});
}
function staticMedia(value){if(typeof value!=="string")return value;const hash=value.match(/\/api\/public\/media\/([a-f0-9]{64})$/)?.[1];return hash?new Map(manifest?.media||[]).get(hash)||value:value}
async function article(id,{force=false}={}){
 const key="article/"+id,cached=routes.get(key);if(cached&&!force&&Date.now()-cached.time<60000)return;
 let doc;
 if(!force){try{const r=await fetch("./content/articles/"+encodeURIComponent(id)+".json");if(r.ok)doc=await r.json()}catch{}}
 if(force||!doc||cache.user){try{doc=await request("/api/public/articles/"+encodeURIComponent(id),undefined,{anonymous:true})}catch(error){if(!doc||error.status===404)throw error}}
 doc.article.avatar=staticMedia(doc.article.avatar);for(const key of Object.keys(doc.article.images||{}))doc.article.images[key]=staticMedia(doc.article.images[key]);for(const c of doc.comments)c.avatar=staticMedia(c.avatar);
 mergeArticles([doc.article]);cache.comments=[...cache.comments.filter(c=>c.articleId!==id),...doc.comments];cache.voteTotals[id]={...doc.votes,mine:0};
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
export const routeLoading=()=>remote&&inflight.has(route().pathname+route().search);
export async function refresh({force=false}={}){
 if(!remote)return;
 const current=route(),key=current.pathname+current.search;
 if(readyRoute===key&&!force)return;
 if(inflight.has(key)){const previous=inflight.get(key);if(!force)return previous;try{await previous}catch{}return refresh({force:true})}
 const work=(async()=>{await publicLoad();await profile();const [name,id]=current.pathname.slice(1).split("/");
 if(name==="workspace"||name==="messages"||name==="announcements"){
 if(cache.user){const cached=routes.get(key);const tab=name==="messages"?"messages":name==="announcements"?"announcements":id||"";let data=cached?.data;
 if(force||!data||Date.now()-cached.time>30000){data=await request("/api/workspace?tab="+encodeURIComponent(tab)+"&page="+(current.searchParams.get("page")||1));routes.set(key,{time:Date.now(),data})}if(route().pathname+route().search===key)mergePrivate(data)}
 }else if(["submission","edit"].includes(name)&&cache.user){let data=details.get(id);if(force||!data||Date.now()-data.time>30000){data={...await request("/api/submissions/"+encodeURIComponent(id)),time:Date.now()};details.set(id,data)}cache.submissions=[...cache.submissions.filter(s=>s.id!==id),data.submission];cache.recordVersions["submissions/"+id]=data.recordVersion;Object.assign(cache.metrics,data.metrics)}
 else if(name==="report"&&cache.user){const data=await request("/api/reports/"+encodeURIComponent(id));cache.reports=[...cache.reports.filter(r=>r.id!==id),data.report];cache.recordVersions["reports/"+id]=data.recordVersion}
 else if(name==="article")await article(id,{force});else if(name==="search")await ensureSearch();
 if(route().pathname+route().search===key)readyRoute=key;})();inflight.set(key,work);pending=true;
 try{await work}finally{inflight.delete(key);pending=inflight.size>0}
}
export async function initialize(){
 if(!remote)return;if(!base)throw Error("API 地址尚未配置。");
 const url=route();if(url.pathname==="/auth-complete"){const ticket=url.searchParams.get("ticket"),verifier=sessionStorage.getItem("narv-login-verifier");history.replaceState(null,"",location.pathname+location.search+"#/login");try{const data=await request("/auth/exchange",{ticket,verifier});sessionStorage.setItem(sessionKey,data.token);location.hash="#/"+(sessionStorage.getItem("narv-next")||"workspace")}finally{sessionStorage.removeItem("narv-login-verifier")}}
 await refresh();
}
export async function login(){const bytes=crypto.getRandomValues(new Uint8Array(32)),verifier=btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");sessionStorage.setItem("narv-login-verifier",verifier);const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");location.assign(base+"/auth/github?challenge="+challenge)}
function clearPrivate(){const pub={articles:cache.articles,comments:cache.comments.filter(c=>c.status==="published"&&!c.authorId),announcements:cache.announcements.filter(a=>a.audience==="public")};cache={...empty(),...pub};routes.clear();details.clear();readyRoute="";meLoaded=false}
export async function logout(){if(!remote){local.saveSession(null);return}try{await request("/auth/logout",{})}finally{sessionStorage.removeItem(sessionKey);clearPrivate()}}
async function mutate(name,args){try{const response=await request("/api/command",{name,args,recordVersions:cache.recordVersions});routes.clear();details.clear();readyRoute="";await profile({force:true});await refresh({force:true});return response.result}catch(error){try{await refresh({force:true})}catch{}throw error}}
export const session=()=>remote?cache.user:local.session();
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
