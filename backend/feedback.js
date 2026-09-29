import {save} from "./repository.js";
import {makeNotification} from "../public/messages.js";
import {actorScope} from "./scopes.js";
import {rank} from "../public/roles.js";
import {face} from "../public/identity.js";
import {suspended} from "../public/moderation.js";
import {hash} from "./auth.js";
const types=new Set(["bug","suggestion","user_report","reviewer_report","other"]);
const statuses=new Set(["open","in_progress","resolved","closed"]);
const complaint=f=>["user_report","reviewer_report"].includes(f.type);
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e};
const check=(ok,message,status=400)=>{if(!ok)fail(message,status)};
const text=(v,max,label,min=0)=>{check(typeof v==="string"&&v.trim().length>=min&&v.length<=max,label);return v.trim()};
export function feedbackRank(f,targetRole){
 if(!complaint(f)||!f.target_id)return 4;
 const level=rank(targetRole);return level===5?4:Math.max(4,(level>=0?level:f.required_rank-1)+1);
}
export function canManageFeedback(f,actor,targetRole){
 return !!actor&&rank(actor)>=feedbackRank(f,targetRole)&&!suspended(actor)&&actor.id!==f.target_id&&(!complaint(f)||actor.id!==f.owner_id);
}
const estimate=f=>4096+2*new TextEncoder().encode(JSON.stringify(f)).length;
function dto(f,actor,targetRole,handlerName=""){
 return {id:f.id,type:f.type,title:f.title,content:f.content,evidence:f.evidence,targetUid:f.target_uid,targetLabel:f.target_label,relatedId:f.related_id,reviewVersion:f.review_version,reviewRound:f.review_round,
 reporter:{name:f.reporter_name,uid:f.reporter_uid,side:f.reporter_side},contactEmail:f.contact_email,pageUrl:f.page_url,status:f.status,note:f.note,
 handlerName,claimedByMe:f.handler_id===actor.id,requiredRank:feedbackRank(f,targetRole),highestRoleException:targetRole==="original_editor",
 createdAt:f.created_at,updatedAt:f.updated_at,version:f.version,history:JSON.parse(f.history).map(({actor_id,...e})=>e)};
}
async function actor(env,userId){const b=await actorScope(env.DB,userId);return {before:b,user:b.state.users[0]}}
async function targetByInput(env,u,d){
 if(!["user_report","reviewer_report"].includes(d.type))return null;
 if(d.targetUid){
  check(/^[CR]-[a-f0-9]{16}$/i.test(d.targetUid),"请填写完整的站内 UID（C- 或 R- 开头）。");
  const row=await env.DB.prepare("SELECT id,head,version FROM entities WHERE kind='users' AND (lower(json_extract(head,'$.community.uid'))=lower(?) OR lower(json_extract(head,'$.review.uid'))=lower(?)) LIMIT 1").bind(d.targetUid,d.targetUid).first();
  check(row,"未找到该 UID，请检查是否填写完整。");return {...JSON.parse(row.head),_recordVersion:row.version};
 }
 check(d.type==="reviewer_report"&&d.relatedId,"举报用户请填写 UID；举报审稿人可填写 UID 或自己的稿件编号。");
 const row=await env.DB.prepare("SELECT head FROM entities WHERE key=? AND owner_id=?").bind("submissions/"+d.relatedId,u.id).first();
 check(row,"未找到你的稿件，无法据此定位审稿人。");
 const s=JSON.parse(row.head);let id;if(d.reviewVersion||d.reviewRound){const matches=(s.reviews||[]).filter(r=>(!d.reviewVersion||r.version===d.reviewVersion)&&(!d.reviewRound||(r.round||1)===d.reviewRound));check(matches.length===1,"对应审稿意见不存在或不唯一，请同时填写版本与轮次。");id=matches[0].reviewerId}else id=(s.status==="reviewing"?s.reviewerId:null)||s.reviews?.at(-1)?.reviewerId||s.withdrawnReviewerId;
 check(id,"该稿件还没有可以定位的审稿人，请填写审稿身份 UID。");
 const result=await env.DB.prepare("SELECT head,version FROM entities WHERE key=?").bind("users/"+id).first();
 check(result,"该审稿账号已不存在。");return {...JSON.parse(result.head),_recordVersion:result.version};
}
export async function createFeedback(env,userId,input){
 const {before,user}=await actor(env,userId);check(input&&types.has(input.type),"请选择反馈类型。");
 const d={type:input.type,title:text(input.title,100,"标题需 5–100 字。",5),content:text(input.content,10000,"反馈正文需 20–10000 字。",20),
 evidence:text(input.evidence||"",4000,"补充证据最多 4000 字。"),targetUid:text(input.targetUid||"",80,"UID 过长。"),
 relatedId:text(input.relatedId||"",100,"稿件编号过长。"),contactEmail:text(input.contactEmail||"",254,"联系邮箱过长。"),
 pageUrl:text(input.pageUrl||"",2048,"页面地址过长。"),reviewVersion:Number(input.reviewVersion||0),reviewRound:Number(input.reviewRound||0),identity:input.identity==="review"?"review":"community"};
 if(!["user_report","reviewer_report"].includes(d.type))d.targetUid="";if(d.type!=="reviewer_report"){d.reviewVersion=0;d.reviewRound=0}for(const number of [d.reviewVersion,d.reviewRound])check(Number.isInteger(number)&&number>=0&&number<=10000,"版本与轮次需为有效的正整数，或留空。");
 if(d.contactEmail)check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail),"请填写有效联系邮箱。");
 if(d.pageUrl){let url;try{url=new URL(d.pageUrl)}catch{fail("页面地址需为有效的 HTTP 或 HTTPS 地址。")}check(["http:","https:"].includes(url.protocol),"页面地址需为 HTTP 或 HTTPS 地址。")}
 check(input.privateConsent===true,"请确认将反馈作为私密信息提交后台。");
 const requested=input.requestId||crypto.randomUUID();check(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requested),"反馈请求编号无效。");
 const id="F-"+requested.toLowerCase(),fingerprint=await hash(JSON.stringify(d)),old=await env.DB.prepare("SELECT owner_id,fingerprint,created_at FROM feedback WHERE id=?").bind(id).first();
 if(old){check(old.owner_id===userId&&old.fingerprint===fingerprint,"请求编号已使用，请重新打开表单再提交。",409);return {id,receivedAt:old.created_at}}
 const target=await targetByInput(env,user,d);check(!target||target.id!==userId,"不能举报自己；其他问题请选“其他反馈”。");
 check(!target||target.accountStatus!=="deleting","该账号已注销。");
 const p=face(user,d.identity),side=d.targetUid.startsWith("C-")||d.targetUid.startsWith("c-")?"community":"review",now=new Date().toISOString(),localDate=new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10),day=new Date(Date.parse(localDate+"T00:00:00.000Z")-8*3600000).toISOString();
 const item={id,owner_id:userId,type:d.type,title:d.title,content:d.content,evidence:d.evidence,target_id:target?.id||"",target_uid:target?face(target,side).uid:"",target_label:target?face(target,side).name:"",
 related_id:d.relatedId,review_version:d.reviewVersion,review_round:d.reviewRound,required_rank:target?rank(target)===5?4:Math.max(4,rank(target)+1):4,reporter_name:p.name,reporter_uid:p.uid,reporter_side:d.identity,
 contact_email:d.contactEmail,page_url:d.pageUrl,status:"open",handler_id:"",note:"",history:"[]",created_at:now,updated_at:now,version:1,fingerprint};
 item.bytes=estimate(item);
 if(target){before.dependencies.push("users/"+target.id);before.versions["users/"+target.id]=target._recordVersion}
 const after=structuredClone(before.state),admins=await env.DB.prepare("SELECT head FROM entities WHERE kind='users' AND role IN ('editor','original_editor') ORDER BY CASE WHEN role='original_editor' THEN 0 ELSE 1 END,id LIMIT 20").all();
 for(const row of admins.results){const editor=JSON.parse(row.head);if(editor.id!==userId&&canManageFeedback(item,editor,target?.role))after.notifications.push(makeNotification(editor.id,"收到新的私密反馈","请在后台私密反馈中查看与处理。","#/workspace/feedback","review"))}
 const token=crypto.randomUUID(),columns=Object.keys(item);
 try{await save(env.DB,before,after,{extra:[
  env.DB.prepare("INSERT INTO write_guard(id,ok) SELECT ?,CASE WHEN (SELECT count(*) FROM feedback WHERE owner_id=? AND created_at>=?)<5 THEN 1 ELSE 0 END").bind(token,userId,day),
  env.DB.prepare("INSERT INTO feedback("+columns.join(",")+") VALUES("+columns.map(()=>"?").join(",")+")").bind(...columns.map(k=>item[k])),
  env.DB.prepare("DELETE FROM write_guard WHERE id=?").bind(token)
 ]})}catch(e){
  if(e.status===409||/CHECK|UNIQUE/.test(String(e))){const committed=await env.DB.prepare("SELECT owner_id,fingerprint,created_at FROM feedback WHERE id=?").bind(id).first();if(committed?.owner_id===userId&&committed.fingerprint===fingerprint)return {id,receivedAt:committed.created_at};const count=await env.DB.prepare("SELECT count(*) n FROM feedback WHERE owner_id=? AND created_at>=?").bind(userId,day).first();if(count.n>=5)fail("每个账号每天最多提交 5 条反馈，请集中说明。",429);fail("账号状态发生变化或存储空间不足；反馈内容仍保留，请稍后重试。",409)}throw e;
 }
 return {id,receivedAt:now};
}
const currentRankSQL="CASE WHEN f.type NOT IN ('user_report','reviewer_report') OR f.target_id='' THEN 4 WHEN target.role='original_editor' THEN 4 WHEN target.role='editor' THEN 5 WHEN target.id IS NOT NULL THEN 4 ELSE f.required_rank END";
export async function feedbackInbox(env,userId,{type="",status="",page=1}={}){
 const {user}=await actor(env,userId);check(rank(user)>=4&&!suspended(user),"仅有效的 Editor 及以上可查看私密反馈。",403);
 check(!type||types.has(type),"反馈类型无效。");check(!status||statuses.has(status),"反馈状态无效。");
 const n=Math.min(10000,Math.max(1,Math.floor(Number(page)||1))),rows=await env.DB.prepare("SELECT f.id,f.type,f.title,f.status,f.created_at,f.updated_at,f.version,"+currentRankSQL+" required_rank FROM feedback f LEFT JOIN entities target ON target.key='users/'||f.target_id WHERE ? >= "+currentRankSQL+" AND f.target_id!=? AND (f.type NOT IN ('user_report','reviewer_report') OR f.owner_id!=?) AND (?='' OR f.type=?) AND (?='' OR f.status=?) ORDER BY f.created_at DESC,f.id LIMIT 51 OFFSET ?").bind(rank(user),userId,userId,type,type,status,status,(n-1)*50).all();
 return {items:rows.results.slice(0,50).map(f=>({id:f.id,type:f.type,title:f.title,status:f.status,createdAt:f.created_at,updatedAt:f.updated_at,version:f.version,requiredRank:f.required_rank})),next:rows.results.length>50,page:n};
}
async function readable(env,userId,id){
 const {before,user}=await actor(env,userId),row=await env.DB.prepare("SELECT f.*,target.role target_role,target.version target_version,handler.review_name handler_name FROM feedback f LEFT JOIN entities target ON target.key='users/'||f.target_id LEFT JOIN entities handler ON handler.key='users/'||f.handler_id WHERE f.id=?").bind(id).first();
 check(row&&canManageFeedback(row,user,row.target_role),"反馈不存在或当前账号无权查看。",403);return {before,user,row};
}
export async function feedbackDetail(env,userId,id){const {user,row}=await readable(env,userId,id);return dto(row,user,row.target_role,row.handler_name||"")}
export async function updateFeedback(env,userId,id,input){
 const {before,user,row}=await readable(env,userId,id);check(Number(input.expectedVersion)===row.version,"反馈已被其他人更新，请刷新再处理。",409);
 const f={...row};delete f.target_role;delete f.target_version;delete f.handler_name;const history=JSON.parse(f.history),now=new Date().toISOString();
 check(history.length<40,"本条反馈处理记录已达上限，请在现有结果中完成归档。");
 if(input.action==="claim"){check(f.status==="open"&&!f.handler_id,"反馈已被领取或处理。",409);f.status="in_progress";f.handler_id=userId}
 else if(input.action==="resolve"||input.action==="close"){check(f.status==="in_progress"&&f.handler_id===userId,"仅当前处理人可以完成或关闭反馈。",403);f.note=text(input.note||"",5000,"处理备注需 10–5000 字。",10);f.status=input.action==="resolve"?"resolved":"closed"}
 else if(input.action==="reopen"){check(["resolved","closed"].includes(f.status),"仅已完成反馈可以重新打开。");f.note=text(input.note||"",5000,"重新打开的说明需 10–5000 字。",10);f.status="open";f.handler_id=""}
 else fail("处理动作无效。");
 history.push({action:input.action,date:now,actor_id:userId,actor_name:face(user,"review").name,note:input.action==="claim"?"":f.note});f.history=JSON.stringify(history);f.updated_at=now;f.version++;f.bytes=estimate(f);
 const guard=crypto.randomUUID(),keys=["status","handler_id","note","history","updated_at","version","bytes"];
 const deps=[{key:"users/"+userId,version:before.versions["users/"+userId]},...(row.target_id&&row.target_version?[{key:"users/"+row.target_id,version:row.target_version}]:[])];
 try{await env.DB.batch([
  env.DB.prepare("INSERT INTO write_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM json_each(?) d LEFT JOIN entities e ON e.key=json_extract(d.value,'$.key') WHERE COALESCE(e.version,-1)!=json_extract(d.value,'$.version')) OR COALESCE((SELECT version FROM feedback WHERE id=?),-1)!=? THEN 0 ELSE 1 END").bind(guard,JSON.stringify(deps),id,row.version),
  env.DB.prepare("UPDATE feedback SET "+keys.map(k=>k+"=?").join(",")+" WHERE id=? AND version=?").bind(...keys.map(k=>f[k]),id,row.version),
  env.DB.prepare("INSERT INTO write_guard(id,ok) SELECT ?,CASE WHEN bytes<=314572800 THEN 1 ELSE 0 END FROM storage_totals WHERE id=1").bind(guard+":capacity"),
  env.DB.prepare("DELETE FROM write_guard WHERE id IN (?,?)").bind(guard,guard+":capacity")
 ])}catch(e){if(/CHECK/.test(String(e)))fail("反馈、权限或存储状态已有变化，请刷新后重试。",409);throw e}
 return dto(f,user,row.target_role,f.handler_id===userId?face(user,"review").name:"");
}
