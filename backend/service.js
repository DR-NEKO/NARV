import {award} from "../public/accountability.js";
import {actorScope,workspaceScope,submissionScope,commandScope} from "./scopes.js";
import {hydrate} from "./codec.js";
import {publicStatements} from "./public-content.js";
import {engine,load,save,select,loadKeys} from "./repository.js";
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
 return {revision,user:u?member(u,u):null,users:users.map(x=>member(x,u)),submissions,articles,comments:visibleComments,myComments:mine,reports:u?db.reports(u).map(r=>reportView(r,u)):[],scores:u?db.scores(u):[],
   applications:u?db.applications(u):[],bookmarks:db.bookmarks(u),notifications:db.notifications(u),announcements:db.announcements(u).map(({actorId,archivedBy,...a})=>a),
   accountEvents:rank(u)>=3?state.accountEvents:[],identityAudits:rank(u)>=4?db.identityAudits(u):[],metrics:{...visibleMetrics,...(rank(u)>=3?Object.fromEntries(users.map(x=>{const m=db.userMetrics(x.id);return [x.id,{reviews:m.reviews,accepted:m.accepted,eligible:m.eligible}]})): {})},
   voteTotals:Object.fromEntries(articles.map(a=>[a.id,db.votes(a.id,u)]))};
}
const commands={
 report:(d,u,a)=>d.report(u,...a),claimAccountability:(d,u,a)=>d.claimAccountability(u,...a),resolveAccountability:(d,u,a)=>d.resolveAccountability(u,...a),
 create:(d,u,a)=>d.create(u,a[0]),action:(d,u,a)=>d.action(a[0],a[1],u,a[2]||{}),
 addComment:(d,u,a)=>d.addComment(u,...a),moderateComment:(d,u,a)=>d.moderateComment(u,...a),
 editComment:(d,u,a)=>d.editComment(u,...a),withdrawComment:(d,u,a)=>d.withdrawComment(u,...a),
 apply:(d,u,a)=>d.apply(u,a[0]),endorse:(d,u,a)=>d.endorse(u,...a),promote:(d,u,a)=>d.promote(u,...a),
 markRead:(d,u,a)=>d.markRead(u,a[0]),announce:(d,u,a)=>d.announce(u,a[0]),archiveAnnouncement:(d,u,a)=>d.archiveAnnouncement(u,a[0]),
 updateProfiles:(d,u,a)=>d.updateProfiles(u,a[0]),revealIdentity:(d,u,a)=>d.revealIdentity(u,...a),
 toggleBookmark:(d,u,a)=>d.toggleBookmark(u,a[0]),vote:(d,u,a)=>d.vote(u,...a)
};
export async function publicParts(db){
 const rows=await db.prepare("SELECT kind,data FROM public_documents ORDER BY key LIMIT 500").all();
 return {articles:rows.results.filter(r=>r.kind==="articles").map(r=>JSON.parse(r.data)),comments:rows.results.filter(r=>r.kind==="comments").map(r=>JSON.parse(r.data)),announcements:rows.results.filter(r=>r.kind==="announcements").map(r=>JSON.parse(r.data))};
}
async function views(env,before,userId,{thin=true}={}){
 const data=snapshot(before.state,userId,before.revision);
 const ids=[...new Set([...before.state.submissions.filter(s=>s.authorId===userId).map(s=>s.id),...before.state.bookmarks.map(b=>b.articleId),...before.state.comments.map(c=>c.articleId)])];
 const rows=await env.DB.prepare("SELECT summary FROM public_documents WHERE kind='articles' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
 const pub={articles:rows.results.map(r=>({...JSON.parse(r.summary),content:"",images:{}})),comments:[],announcements:[]};
 data.articles=pub.articles;data.comments=[...pub.comments,...data.comments.filter(c=>c.status!=="published")];data.announcements=[...pub.announcements,...data.announcements.filter(a=>a.audience!=="public")];
  const score=await env.DB.prepare("SELECT points FROM score_totals WHERE user_id=?").bind(userId).first();data.points=score?.points||0;
 if(rank(data.user)>=3){const totals=await env.DB.prepare("SELECT user_id,points FROM score_totals WHERE user_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(before.state.users.map(x=>x.id))).all();for(const t of totals.results){data.metrics[t.user_id]||={};data.metrics[t.user_id].points=t.points}}
 data.recordVersions=Object.fromEntries(Object.entries(before.versions).filter(([key])=>!key.startsWith("users/")||key==="users/"+userId));
 const totals=await env.DB.prepare("SELECT article_id,up,down FROM vote_totals WHERE article_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(pub.articles.map(a=>a.id))).all();
 for(const t of totals.results)data.voteTotals[t.article_id]={up:t.up,down:t.down,mine:before.state.votes.find(v=>v.articleId===t.article_id&&v.userId===userId)?.value||0};
 if(thin)data.submissions=data.submissions.map(s=>({...s,content:"",images:{},workingDraft:undefined,versions:s.versions.map(v=>({version:v.version,title:v.title,date:v.date}))}));
 return data;
}
export async function bootstrap(env,userId,options={}){
 if(!userId){const pub=await publicParts(env.DB);return {...snapshot(engine().state()),...pub,recordVersions:{}}}
 const before=await workspaceScope(env.DB,userId,options);return views(env,before,userId,{thin:options.thin!==false});
}
export async function detail(env,userId,id,version){
 const before=await submissionScope(env.DB,userId,id),u=before.state.users.find(x=>x.id===userId),s=before.state.submissions.find(x=>x.id===id);
 if(!canView(s,u)){const e=Error("当前账号没有访问权限。");e.status=403;throw e}
 if(version!==undefined){const v=s.versions.find(x=>x.version===Number(version));if(!v)throw Error("版本不存在。");return hydrate(env.DB,v)}
 const view=submissionView(s,u),descriptors=view.versions.map(v=>({version:v.version,title:v.title,date:v.date}));view.versions=[];
 const hydrated=await hydrate(env.DB,view);hydrated.versions=descriptors;
 return {submission:hydrated,recordVersion:before.versions["submissions/"+id],metrics:{[hydrated.authorId]:engine(before.state).userMetrics(s.authorId)}};
}
export async function command(env,userId,payload){
 if(!Object.hasOwn(commands,payload?.name)||!Array.isArray(payload.args)||payload.args.length>6)throw Error("无效操作。");
 const before=await commandScope(env.DB,userId,payload.name,payload.args),u=before.state.users.find(x=>x.id===userId);
 const primary={claimAccountability:"reports",resolveAccountability:"reports",action:"submissions",moderateComment:"comments",editComment:"comments",withdrawComment:"comments",endorse:"applications",promote:"users",archiveAnnouncement:"announcements",updateProfiles:"users"};
 const key=primary[payload.name]?primary[payload.name]+"/"+(payload.name==="updateProfiles"?userId:payload.args[0]):null;
 if(key&&payload.recordVersions?.[key]!==undefined&&payload.recordVersions[key]!==before.versions[key]){const e=Error("这条记录已有更新，请刷新后重新操作。");e.status=409;throw e}
 if(payload.name==="create"){const count=await env.DB.prepare("SELECT count(*) AS n FROM entities WHERE kind='submissions' AND owner_id=?").bind(userId).first();if(count.n>=200)throw Error("每个账号最多保留 200 篇稿件；请先整理草稿。")}
 if(payload.name==="updateProfiles")before.dependencies.push(...before.state.users.map(x=>"users/"+x.id));
 const domain=engine(before.state),result=commands[payload.name](domain,u,payload.args),after=domain.state(),extra=[];
 if(payload.name==="vote"){
 const article=payload.args[0],old=before.state.votes.find(v=>v.userId===userId&&v.articleId===article)?.value||0,next=after.votes.find(v=>v.userId===userId&&v.articleId===article)?.value||0;
 extra.push(env.DB.prepare("INSERT INTO vote_totals(article_id,up,down) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET up=up+excluded.up,down=down+excluded.down").bind(article,Number(next===1)-Number(old===1),Number(next===-1)-Number(old===-1)));
 }
 const publicize=(db,encoded,removed)=>publicStatements(db,encoded,removed,{apiBase:env.API_URL||""});
 if(["vote","toggleBookmark"].includes(payload.name)){
 const id=payload.args[0],old=before.state.votes.some(v=>v.articleId===id&&v.userId===userId&&v.value===1)||before.state.bookmarks.some(b=>b.articleId===id&&b.userId===userId),current=after.votes.some(v=>v.articleId===id&&v.userId===userId&&v.value===1)||after.bookmarks.some(b=>b.articleId===id&&b.userId===userId),article=after.submissions.find(s=>s.id===id);
 if(article&&article.authorId!==userId)extra.push(env.DB.prepare("INSERT INTO support_totals(article_id,supporters) VALUES(?,?) ON CONFLICT(article_id) DO UPDATE SET supporters=supporters+excluded.supporters").bind(id,Number(current)-Number(old)));
 }
 const revision=await save(env.DB,before,after,{extra,publicize});
 return {result:payload.name==="action"?submissionView(result,u):["report","claimAccountability","resolveAccountability"].includes(payload.name)?reportView(result,u):result??null,revision};
}
export async function scheduled(env){
 // Free D1 allows 50 statements per invocation. Five publications in one
 // transaction plus one eight-step support reward and cleanup use at most 49.
 const due=await env.DB.prepare("SELECT key FROM entities WHERE kind='submissions' AND status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at,key LIMIT 5").bind(new Date().toISOString()).all();
 if(due.results.length){const before=await loadKeys(env.DB,due.results.map(r=>r.key));const domain=engine(before.state,{scheduler:true});try{await save(env.DB,before,domain.state(),{publicize:(db,e,r)=>publicStatements(db,e,r,{apiBase:env.API_URL||""})})}catch(e){if(e.status!==409)throw e}}
 const rewards=await env.DB.prepare("SELECT s.article_id,s.supporters,s.bonus_awarded FROM support_totals s JOIN entities e ON e.key='submissions/'||s.article_id AND e.status='published' WHERE s.supporters >= (s.bonus_awarded+1)*5 AND s.bonus_awarded<8 ORDER BY s.article_id LIMIT 1").all();
 for(const row of rewards.results){
  const target=Math.min(8,Math.floor(row.supporters/5)),keys=["submissions/"+row.article_id,...Array.from({length:target},(_,i)=>"scoreEvents/publication:"+row.article_id+":bonus:"+(i+1))],before=await loadKeys(env.DB,keys),article=before.state.submissions[0];
  if(!article||article.status!=="published")continue;
  const after=structuredClone(before.state);for(let n=1;n<=target;n++)award(after,article.authorId,"publication:"+article.id+":bonus:"+n,1,"有效读者支持奖励",{sourceId:article.id});
  try{await save(env.DB,before,after,{extra:[env.DB.prepare("UPDATE support_totals SET bonus_awarded=MAX(bonus_awarded,?) WHERE article_id=?").bind(target,article.id)]})}catch(e){if(e.status!==409)throw e}
 }
 await env.DB.batch([env.DB.prepare("DELETE FROM blobs WHERE hash IN (SELECT b.hash FROM blobs b WHERE b.created_at<? AND NOT EXISTS(SELECT 1 FROM blob_links l WHERE l.hash=b.hash) AND NOT EXISTS(SELECT 1 FROM public_blob_refs p WHERE p.hash=b.hash) LIMIT 100)").bind(new Date(Date.now()-86400000).toISOString())]);
 const now=Date.now();await env.DB.batch([env.DB.prepare("DELETE FROM auth WHERE key IN (SELECT key FROM auth WHERE expires<? LIMIT 1000)").bind(now),env.DB.prepare("DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires<? LIMIT 1000)").bind(now)]);
}

export async function me(env,userId){
 if(!userId)return {user:null,unread:0};
 const b=await actorScope(env.DB,userId),u=b.state.users.find(x=>x.id===userId);
 const n=await env.DB.prepare("SELECT count(*) AS n FROM entities WHERE kind='notifications' AND owner_id=? AND json_extract(head,'$.read')=0").bind(userId).first();
 const total=await env.DB.prepare("SELECT points FROM score_totals WHERE user_id=?").bind(userId).first();return {user:member(u,u),points:total?.points||0,recordVersions:{["users/"+userId]:b.versions["users/"+userId]},unread:n.n};
}

export function reportView(r,u){if(rank(u)>=r.requiredRank||r.originalReviewerId===u.id)return {...r,reporterId:r.reporterId===u.id?u.id:"reporter:"+r.id,authorId:r.authorId===u.id?u.id:"author:"+r.articleId};const {id,articleId,articleTitle,reason,evidence,status,createdAt,updatedAt,decidedAt,verdictNote,remedy}=r;return {id,articleId,articleTitle,reason,evidence,status,createdAt,updatedAt,decidedAt,verdictNote,remedy}}
export async function reportDetail(env,userId,id){const before=await actorScope(env.DB,userId),part=await loadKeys(env.DB,["reports/"+id]),u=before.state.users[0],r=part.state.reports[0];if(!r||![r.reporterId,r.authorId,r.originalReviewerId].includes(u.id)&&rank(u)<r.requiredRank){const e=Error("无权读取此举报。");e.status=403;throw e}return {report:reportView(r,u),recordVersion:part.versions["reports/"+id]}}
