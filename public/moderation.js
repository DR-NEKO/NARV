import {rank} from "./roles.js";
import {assert} from "./workflow.js";
export const suspended=(u,now=Date.now())=>!!u&&(u.accountStatus==="deleting"||u.suspension?.permanent===true||Date.parse(u.suspension?.until)>now);
export function canManage(actor,target){return !!actor&&!!target&&actor.id!==target.id&&rank(actor)>=4&&rank(actor)>rank(target)}
export function moderateAccount(actor,target,data,now=new Date().toISOString()){
 assert(canManage(actor,target),"仅 Editor 及以上可管理严格低于自己的账号。");
 assert(["temporary","permanent","restore"].includes(data.action),"请选择封禁或解封方式。");
 assert(data.reason?.trim().length>=10&&data.reason.length<=2000,"请提供 10–2000 字处理依据。");
 const next=structuredClone(target);
 if(data.action==="restore")delete next.suspension;
 else {const until=data.action==="temporary"?Date.parse(data.until):null;assert(data.action!=="temporary"||Number.isFinite(until)&&until>Date.parse(now)&&until<=Date.parse(now)+3660*86400000,"请选择有效封禁截止时间。");next.suspension={permanent:data.action==="permanent",until:until?new Date(until).toISOString():null,reason:data.reason.trim(),actorId:actor.id,date:now}}
 return next;
}
export function canDeleteDraft(s,u){
 if(!s||s.authorId!==u?.id||s.publishedAt||s.publicSnapshot||s.moderation||(s.reviews||[]).length||(s.decisions||[]).length)return false;
 if(s.status==="withdrawn")return true;
 return s.status==="draft"&&Number(s.version||0)===0&&!(s.versions||[]).length&&!(s.consents||[]).length;
}
export function expireTemporary(s,now=new Date().toISOString()){
 if(s.moderation?.kind!=="temporary_down"||!s.moderation.deadline||Date.parse(s.moderation.deadline)>Date.parse(now))return s;
 const next=structuredClone(s);next.status="banned";next.moderation={...next.moderation,kind:"ban",deadline:null,expiredAt:now,reason:"暂时下架后 30 天内未提交修订，转为永久下架。"};delete next.workingDraft;delete next.publicSnapshot;next.updatedAt=now;next.history||=[];next.history.push({actorId:"scheduler",role:"system",date:now,label:next.moderation.reason});return next;
}
