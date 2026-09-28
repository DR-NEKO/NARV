import * as local from "./store.js";
import {config} from "./config.js";
import {metrics} from "./governance.js";
export const remote=config.mode==="remote";
let cache={user:null,users:[],submissions:[],articles:[],comments:[],myComments:[],applications:[],bookmarks:[],notifications:[],announcements:[],identityAudits:[],metrics:{},voteTotals:{},revision:0};
const base=config.apiBase?.replace(/\/$/,""),sessionKey="narv-api-session";
async function request(path,body){
 const token=sessionStorage.getItem(sessionKey);
 const res=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"});
 const data=await res.json();if(!res.ok){if(res.status===401){sessionStorage.removeItem(sessionKey);cache.user=null}throw Error(data.error||"服务暂时无法连接。")}return data;
}
export async function refresh(){if(remote)cache=await request("/api/bootstrap")}
export async function initialize(){
 if(!remote)return;
 if(!base||!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw Error("站点 API 地址尚未正确配置。");
 const url=new URL(location.hash.slice(1)||"/","https://narv.local");
 if(url.pathname==="/auth-complete"){
  const ticket=url.searchParams.get("ticket"),verifier=sessionStorage.getItem("narv-login-verifier");
  history.replaceState(null,"",location.pathname+location.search+"#/login");
  try{const data=await request("/auth/exchange",{ticket,verifier});sessionStorage.setItem(sessionKey,data.token);location.hash="#/"+(sessionStorage.getItem("narv-next")||"workspace")}finally{sessionStorage.removeItem("narv-login-verifier")}
 }
 await refresh();
}
export async function login(){
 const bytes=crypto.getRandomValues(new Uint8Array(32)),verifier=btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
 sessionStorage.setItem("narv-login-verifier",verifier);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
 location.assign(base+"/auth/github?challenge="+challenge);
}
export async function logout(){if(!remote){local.saveSession(null);return}try{await request("/auth/logout",{})}finally{sessionStorage.removeItem(sessionKey);cache={...cache,user:null,users:[],submissions:[],comments:[],myComments:[],notifications:[],bookmarks:[],applications:[],identityAudits:[],metrics:{},voteTotals:{}}}await refresh()}
async function mutate(name,args){
 try {const response=await request("/api/command",{name,args,revision:cache.revision});cache=response.snapshot;return response.result}
 catch(error){try{await refresh()}catch{}throw error}
}
export const session=()=>remote?cache.user:local.session();
export const accounts=()=>remote?cache.users:local.accounts();
export const account=id=>accounts().find(u=>u.id===id);
export const saveSession=u=>{if(remote)throw Error("线上账号只能通过 GitHub 登录。");return local.saveSession(u)};
export const all=()=>remote?cache.submissions:local.all();
export const list=u=>remote?cache.submissions:local.list(u);
export const get=(id,u)=>remote?cache.submissions.find(s=>s.id===id):local.get(id,u);
export const publicArticles=()=>remote?cache.articles:local.publicArticles();
export const comments=(id,u)=>remote?cache.comments.filter(c=>(!id||c.articleId===id)&&(u||c.status==="published")):local.comments(id,u);
export const myComments=u=>remote?cache.myComments:local.myComments(u);
export const applications=u=>remote?cache.applications:local.applications(u);
export const bookmarks=u=>remote?cache.bookmarks:local.bookmarks(u);
export const notifications=u=>remote?cache.notifications:local.notifications(u);
export const unread=u=>notifications(u).filter(n=>!n.read).length;
export const announcements=u=>remote?cache.announcements:local.announcements(u);
export const identityAudits=u=>remote?cache.identityAudits:local.identityAudits(u);
export const userMetrics=id=>remote?cache.metrics[id]||metrics({id},[]):local.userMetrics(id);
export const votes=(id,u)=>remote?cache.voteTotals[id]||{up:0,down:0,mine:0}:local.votes(id,u);
export const draftKey=(u,id)=>(remote?"narv-remote-draft:":"")+local.draftKey(u,id);
export const create=(u,d)=>remote?mutate("create",[d]):local.create(u,d);
export const action=(id,verb,u,d)=>remote?mutate("action",[id,verb,d]):local.action(id,verb,u,d);

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
export const accountEvents=u=>remote?cache.accountEvents||[]:local.state().accountEvents;
