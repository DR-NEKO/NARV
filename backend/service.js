import {engine,load,save} from "./repository.js";
import {rank} from "../public/roles.js";
import {face} from "../public/identity.js";
import {canView} from "../public/workflow.js";
export const publicComment=c=>({id:c.id,articleId:c.articleId,author:c.author,avatar:c.avatar,content:c.content,status:c.status,createdAt:c.createdAt,updatedAt:c.updatedAt});
function member(u,actor){return u.id===actor?.id?{id:u.id,name:face(u).name,role:u.role,community:face(u),review:face(u,"review")}:{id:u.id,name:face(u,"review").name,role:u.role,review:face(u,"review"),community:{name:"身份受限",avatar:"◇"}}}
export function submissionView(s,u){
 const item=structuredClone(s);if(s.authorId===u?.id)return item;
 delete item.workingDraft;
 const opaque="author:"+s.id;
 function mask(value){if(value===s.authorId)return opaque;if(Array.isArray(value))return value.map(mask);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mask(v)]));return value}
 const projected=mask(item);for(const h of projected.history||[])if(h.actorId===opaque)h.role="author";return projected;
}
export function snapshot(state,userId,revision=0) {
 const db=engine(state),u=state.users.find(x=>x.id===userId),articles=db.publicArticles().map(a=>({...a,isLocal:false})),mine=db.myComments(u);
 const submissions=u?db.list(u).map(s=>submissionView(s,u)):[];
 const users=u?(rank(u)>=3?state.users:state.users.filter(x=>x.id===u.id)):[];
 const visibleMetrics=u?{[u.id]:db.userMetrics(u.id)}:{};
 for(const s of u?db.list(u):[])visibleMetrics[s.authorId===u.id?u.id:"author:"+s.id]=db.userMetrics(s.authorId);
 const visibleComments=state.comments.filter(c=>c.status==="published"||c.authorId===u?.id||(rank(u)>=1&&c.status==="pending")).map(c=>c.authorId===u?.id||rank(u)>=1&&c.status==="pending"?(c.authorId===u?.id?c:{...c,authorId:"comment-author:"+c.id,reviewedBy:undefined,history:undefined,versions:undefined}):publicComment(c));
 return {revision,user:u?member(u,u):null,users:users.map(x=>member(x,u)),submissions,articles,comments:visibleComments,myComments:mine,
   applications:u?db.applications(u):[],bookmarks:db.bookmarks(u),notifications:db.notifications(u),announcements:db.announcements(u).map(({actorId,archivedBy,...a})=>a),
   accountEvents:rank(u)>=3?state.accountEvents:[],identityAudits:rank(u)>=4?db.identityAudits(u):[],metrics:{...visibleMetrics,...(rank(u)>=3?Object.fromEntries(users.map(x=>{const m=db.userMetrics(x.id);return [x.id,{reviews:m.reviews,accepted:m.accepted,eligible:m.eligible}]})): {})},
   voteTotals:Object.fromEntries(articles.map(a=>[a.id,db.votes(a.id,u)]))};
}
const commands={
 create:(d,u,a)=>d.create(u,a[0]),action:(d,u,a)=>d.action(a[0],a[1],u,a[2]||{}),
 addComment:(d,u,a)=>d.addComment(u,...a),moderateComment:(d,u,a)=>d.moderateComment(u,...a),
 editComment:(d,u,a)=>d.editComment(u,...a),withdrawComment:(d,u,a)=>d.withdrawComment(u,...a),
 apply:(d,u,a)=>d.apply(u,a[0]),endorse:(d,u,a)=>d.endorse(u,...a),promote:(d,u,a)=>d.promote(u,...a),
 markRead:(d,u,a)=>d.markRead(u,a[0]),announce:(d,u,a)=>d.announce(u,a[0]),archiveAnnouncement:(d,u,a)=>d.archiveAnnouncement(u,a[0]),
 updateProfiles:(d,u,a)=>d.updateProfiles(u,a[0]),revealIdentity:(d,u,a)=>d.revealIdentity(u,...a),
 toggleBookmark:(d,u,a)=>d.toggleBookmark(u,a[0]),vote:(d,u,a)=>d.vote(u,...a)
};
export async function command(env,userId,payload) {
 if(!Object.hasOwn(commands,payload?.name)||!Array.isArray(payload.args)||payload.args.length>6)throw Error("无效操作。");
 const before=await load(env.DB),u=before.state.users.find(x=>x.id===userId);
 if(!u){const e=Error("请重新登录。");e.status=401;throw e}
 if(payload.revision!==before.revision){const e=Error("数据已有更新，请刷新后重新操作；未保存文字仍保留在页面。");e.status=409;throw e}
 if(payload.name==="create"&&before.state.submissions.filter(s=>s.authorId===u.id).length>=50)throw Error("试运行期间每个账号最多保存 50 篇稿件。");
 const domain=engine(before.state),result=commands[payload.name](domain,u,payload.args),after=domain.state();
 const revision=await save(env.DB,before,after);
 return {result:payload.name==="action"?submissionView(result,u):result??null,snapshot:snapshot(after,userId,revision)};
}
export async function scheduled(env) {
 const before=await load(env.DB),domain=engine(before.state,{scheduler:true});
 await save(env.DB,before,domain.state());
 const now=Date.now();await env.DB.batch([env.DB.prepare("DELETE FROM auth WHERE expires<?").bind(now),env.DB.prepare("DELETE FROM rate_limits WHERE expires<?").bind(now)]);
}
