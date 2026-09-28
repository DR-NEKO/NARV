import {rank} from "./roles.js";
import {assert} from "./workflow.js";
import {face} from "./identity.js";
export function award(state,userId,key,points,reason,{sourceId="",actorId="system",date=new Date().toISOString()}={}){
 state.scoreEvents||=[];if(state.scoreEvents.some(e=>e.id===key))return false;
 state.scoreEvents.push({id:key,userId,points,reason,sourceId,actorId,date});return true;
}
export const pointsFor=(state,id)=>(state.scoreEvents||[]).filter(e=>e.userId===id).reduce((n,e)=>n+e.points,0);
export function rewardSupport(state,articleId){
 const article=state.submissions.find(s=>s.id===articleId&&s.status==="published");if(!article)return;
 const people=new Set([...state.votes.filter(v=>v.articleId===articleId&&v.value===1),...state.bookmarks.filter(v=>v.articleId===articleId)].filter(v=>v.userId!==article.authorId).map(v=>v.userId));
 for(let n=1;n<=Math.min(8,Math.floor(people.size/5));n++)award(state,article.authorId,"publication:"+articleId+":bonus:"+n,1,"有效读者支持奖励",{sourceId:articleId});
}
export function createReport(state,actor,articleId,data){
 const s=state.submissions.find(s=>s.id===articleId&&s.status==="published");assert(s,"只能举报已发表稿件。");
 assert(data.reason?.trim().length>=30&&data.reason.length<=5000,"请用 30–5000 字说明具体问题与证据。");
 assert(!(state.reports||[]).some(r=>r.articleId===articleId&&r.reporterId===actor.id&&!["dismissed","upheld"].includes(r.status)),"你对这篇稿件已有待处理举报。");
 const approval=[...s.reviews].reverse().find(r=>r.version===s.acceptedVersion&&r.decision==="accept");assert(approval,"缺少发表版本的审批记录，须联系编辑核查。");
 assert(approval.reviewerRank<5,"最高权限不应参与普通审稿，请联系编辑核查历史记录。");
 const recent=(state.reports||[]).filter(r=>r.reporterId===actor.id&&Date.parse(r.createdAt)>Date.now()-86400000);assert(recent.length<3,"每个账号每天最多提交 3 次举报，请集中具体证据。");
 const now=new Date().toISOString(),r={id:"R-"+crypto.randomUUID().slice(0,12),articleId,articleTitle:s.title,authorId:s.authorId,reportedVersion:s.acceptedVersion,reporterId:actor.id,reporterName:face(actor).name,originalReviewerId:approval.reviewerId,originalReviewerName:approval.reviewerName,originalReviewerRole:approval.reviewerRole,originalReviewerRank:approval.reviewerRank,requiredRank:approval.reviewerRank+1,reason:data.reason.trim(),evidence:data.evidence?.trim().slice(0,2000)||"",status:"pending",handlerId:null,createdAt:now,updatedAt:now,history:[]};
 state.reports||=[];state.reports.push(r);return r;
}
export function canHandleReport(r,actor){return !!actor&&rank(actor)>=r.requiredRank&&![r.authorId,r.reporterId,r.originalReviewerId].includes(actor.id)}
export function claimReport(state,actor,id){
 const r=state.reports.find(r=>r.id===id);assert(r&&r.status==="pending"&&canHandleReport(r,actor),"当前举报不可领取，或需要更高权限并回避相关当事人。");
 r.status="reviewing";r.handlerId=actor.id;r.handlerName=face(actor,"review").name;r.updatedAt=new Date().toISOString();r.history.push({action:"claim",actorId:actor.id,date:r.updatedAt});return r;
}
export function decideReport(state,actor,id,data){
 const r=state.reports.find(r=>r.id===id);assert(r&&r.status==="reviewing"&&r.handlerId===actor.id&&canHandleReport(r,actor),"仅有资格的当前复核人可以处理。");
 assert(["upheld","dismissed"].includes(data.verdict),"请选择复核结果。");assert(data.note?.trim().length>=20&&data.note.length<=5000,"请给出 20–5000 字的证据判断与处理理由。");
 const penalty=Number(data.penalty||0);assert([0,2,3,4,5].includes(penalty),"扣分只能选择不扣、2、3、4 或 5 分。");assert(data.verdict!=="dismissed"||penalty===0,"举报不成立时不能扣分。");
 assert(data.conflictFree===true,"请确认不存在利益冲突。");
 const s=state.submissions.find(s=>s.id===r.articleId);assert(s&&s.versions.some(v=>v.version===r.reportedVersion),"被举报版本不存在。");
 const now=new Date().toISOString();r.status=data.verdict;r.verdictNote=data.note.trim();r.decidedAt=now;r.updatedAt=now;r.penalty=penalty;r.penaltyApplied=false;
 if(r.status==="upheld"){
  assert(["ban","temporary_down","nothing","caution","retract","notice"].includes(data.remedy),"请选择撤稿、要求更正或公开提示。");r.remedy=({retract:"ban",notice:"caution"}[data.remedy]||data.remedy);assert(s.moderation?.kind!=="ban"||["ban","nothing"].includes(r.remedy),"永久下架不能通过其他举报改为争议提示或暂时下架。");
  if(penalty&&r.originalReviewerId!=="deleted")r.penaltyApplied=award(state,r.originalReviewerId,"penalty:"+r.articleId+":v"+r.reportedVersion,-penalty,"发表稿件复核确认问题："+data.note.trim(),{sourceId:r.id,actorId:actor.id,date:now});
  if(r.remedy!=="nothing"){s.accountabilityNotice="复核确认存在问题："+data.note.trim();s.accountabilityAt=now;s.moderation={kind:r.remedy,reason:data.note.trim(),reportId:r.id,actorId:actor.id,requiredRank:rank(actor),date:now,deadline:r.remedy==="temporary_down"?new Date(Date.parse(now)+30*86400000).toISOString():null};s.updatedAt=now}
  if(r.remedy==="ban"){s.status="banned";delete s.workingDraft;delete s.publicSnapshot}
  if(r.remedy==="temporary_down"){s.status="temporary_down";s.reviewerId=null;s.requiredRank=rank(actor);delete s.publicSnapshot}
  s.history.push({actorId:actor.id,role:actor.role,date:now,label:"举报复核："+({ban:"永久下架",temporary_down:"暂时下架",nothing:"无影响",caution:"争议提示",retract:"永久下架",notice:"争议提示"}[data.remedy])});
 }
 r.history.push({action:"decision",actorId:actor.id,verdict:r.status,penalty:r.penaltyApplied?-penalty:0,note:r.verdictNote,date:now});return r;
}
