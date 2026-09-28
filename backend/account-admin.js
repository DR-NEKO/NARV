import {actorScope} from "./scopes.js";
import {loadKeys,save,engine,select} from "./repository.js";
import {hydrate} from "./codec.js";
import {rank} from "../public/roles.js";
import {face} from "../public/identity.js";
import {assert} from "../public/workflow.js";
import {random,hash} from "./auth.js";
import {publicStatements} from "./public-content.js";
export async function memberDetail(env,userId,id){
 const before=await actorScope(env.DB,userId),actor=before.state.users[0];assert(rank(actor)>=3,"仅 AE 及以上可查看权限账号资料。");
 const part=await loadKeys(env.DB,["users/"+id]),u=part.state.users[0];assert(u&&u.accountStatus!=="deleting","账号不存在或已注销。");
 const review=face(await hydrate(env.DB,u),"review");
 const rows=await env.DB.batch([env.DB.prepare("SELECT summary FROM public_documents WHERE kind='articles' AND json_extract(summary,'$.authorUid')=? ORDER BY updated_at DESC LIMIT 50").bind(review.uid),env.DB.prepare("SELECT points FROM score_totals WHERE user_id=?").bind(id)]);
 return {member:{id:u.id,role:u.role,review,suspension:u.suspension||null,accountStatus:u.accountStatus||"active"},articles:rows[0].results.map(r=>JSON.parse(r.summary)),points:rows[1].results[0]?.points||0,recordVersion:part.versions["users/"+id]};
}
export async function accountConfirmation(env,actorId,data){
 const b=await actorScope(env.DB,actorId),actor=b.state.users[0],id=data.targetId||actorId,p=await loadKeys(env.DB,["users/"+id]),target=p.state.users[0];
 assert(target&&target.accountStatus!=="deleting","账号不存在或已经注销。");
 assert(actorId===id||actor.role==="original_editor","只能本人或 OE 注销账号。");
 assert(target.role!=="original_editor","请先移交唯一 OE 权限，再注销原账号。");
 assert(data.firstConfirmation===true,"需要第一次明确确认。");
 const challenge=random(),expires=Date.now()+300000;
 await env.DB.prepare("INSERT INTO auth(key,kind,data,expires) VALUES(?,'account-close',?,?)").bind(await hash(challenge),JSON.stringify({actorId,targetId:id,uid:face(target).uid,version:p.versions["users/"+id]}),expires).run();
 return {challenge,uid:face(target).uid,expires,notice:"永久注销会立即停用账号，并排队删除账号、稿件、评论、收藏、通知及相关记录。无法恢复。公开缓存和已下载副本不会立即消失。"};
}
export async function closeAccount(env,actorId,data){
 assert(data.secondConfirmation===true&&typeof data.challenge==="string","需要第二次明确确认。");
 const row=await env.DB.prepare("DELETE FROM auth WHERE key=? AND kind='account-close' AND expires>? RETURNING data").bind(await hash(data.challenge),Date.now()).first();assert(row,"确认已失效，请重新开始。");
 const ticket=JSON.parse(row.data);assert(ticket.actorId===actorId&&ticket.uid===data.uid,"账号或 UID 确认不匹配。");
 const b=await actorScope(env.DB,actorId),actor=b.state.users[0],p=await loadKeys(env.DB,["users/"+ticket.targetId]),target=p.state.users[0];
 assert(target&&target.role!=="original_editor"&&(actorId===target.id||actor.role==="original_editor"),"账号权限发生变化，不能执行注销。");
 assert(p.versions["users/"+target.id]===ticket.version,"账号资料已经变化，请重新确认。");
 const after=structuredClone(p.state);after.users[0].accountStatus="deleting";after.users[0].closedAt=new Date().toISOString();
 p.dependencies.push("users/"+actorId);p.versions["users/"+actorId]=b.versions["users/"+actorId];
 await save(env.DB,p,after,{extra:[
 env.DB.prepare("DELETE FROM auth WHERE json_extract(data,'$.userId')=? OR json_extract(data,'$.targetId')=?").bind(target.id,target.id),
 env.DB.prepare("INSERT INTO account_erasure(user_id,created_at) VALUES(?,?)").bind(target.id,after.users[0].closedAt),
 // Withdraw public projections immediately; bounded cleanup runs in cron.
 env.DB.prepare("DELETE FROM public_blob_refs WHERE document_key IN (SELECT key FROM public_documents WHERE key IN (SELECT key FROM entities WHERE owner_id=? AND kind IN ('submissions','comments')) OR article_id IN (SELECT id FROM entities WHERE owner_id=? AND kind='submissions'))").bind(target.id,target.id),
 env.DB.prepare("DELETE FROM public_documents WHERE key IN (SELECT key FROM entities WHERE owner_id=? AND kind IN ('submissions','comments')) OR article_id IN (SELECT id FROM entities WHERE owner_id=? AND kind='submissions')").bind(target.id,target.id)
 ]});
 return {ok:true,self:actorId===target.id,queued:true};
}
function scrub(value,id){if(value===id)return "deleted";if(Array.isArray(value))return value.map(v=>scrub(v,id));if(!value||typeof value!=="object")return value;const next={...value};for(const [key,v] of Object.entries(next)){if(typeof v==="string"&&v===id)next[key]="deleted";else next[key]=scrub(v,id)}if(value.reviewerId===id){next.reviewerName="已注销审稿人";next.reviewerAvatar="◇"}if(value.originalReviewerId===id)next.originalReviewerName="已注销审稿人";if(value.userId===id){delete next.note}return next}
export async function processErasure(env,planned){
 const job=planned===undefined?await env.DB.prepare("SELECT user_id,phase FROM account_erasure ORDER BY created_at LIMIT 1").first():planned;if(!job)return false;const id=job.user_id;
 if(job.phase==="owned"){
  const rows=await env.DB.prepare("SELECT key,id,kind,article_id FROM entities WHERE kind!='users' AND (owner_id=? OR json_extract(head,'$.actorId')=? OR json_extract(head,'$.targetId')=? OR article_id IN (SELECT id FROM entities WHERE kind='submissions' AND owner_id=?)) ORDER BY CASE WHEN kind='submissions' THEN 1 ELSE 0 END,key LIMIT 100").bind(id,id,id,id).all();
  if(!rows.results.length){await env.DB.prepare("UPDATE account_erasure SET phase='references' WHERE user_id=?").bind(id).run();return true}
  const keys=JSON.stringify(rows.results.map(r=>r.key)),articles=JSON.stringify(rows.results.filter(r=>r.kind==="submissions").map(r=>r.id)),affected=JSON.stringify([...new Set(rows.results.filter(r=>["votes","bookmarks"].includes(r.kind)).map(r=>r.article_id))]);
  await env.DB.batch([
   env.DB.prepare("DELETE FROM public_blob_refs WHERE document_key IN (SELECT value FROM json_each(?))").bind(keys),
   env.DB.prepare("DELETE FROM public_documents WHERE key IN (SELECT value FROM json_each(?))").bind(keys),
   env.DB.prepare("DELETE FROM blob_links WHERE entity_key IN (SELECT value FROM json_each(?))").bind(keys),
   env.DB.prepare("DELETE FROM records WHERE key IN (SELECT value FROM json_each(?))").bind(keys),
   env.DB.prepare("DELETE FROM entities WHERE key IN (SELECT value FROM json_each(?))").bind(keys),
   env.DB.prepare("DELETE FROM vote_totals WHERE article_id IN (SELECT value FROM json_each(?))").bind(articles),
   env.DB.prepare("DELETE FROM support_totals WHERE article_id IN (SELECT value FROM json_each(?))").bind(articles),
   env.DB.prepare("UPDATE vote_totals SET up=(SELECT count(*) FROM entities e WHERE e.kind='votes' AND e.article_id=vote_totals.article_id AND json_extract(e.head,'$.value')=1),down=(SELECT count(*) FROM entities e WHERE e.kind='votes' AND e.article_id=vote_totals.article_id AND json_extract(e.head,'$.value')=-1) WHERE article_id IN (SELECT value FROM json_each(?))").bind(affected),
   env.DB.prepare("UPDATE support_totals SET supporters=(SELECT count(DISTINCT owner_id) FROM entities e WHERE e.article_id=support_totals.article_id AND ((e.kind='votes' AND json_extract(e.head,'$.value')=1) OR e.kind='bookmarks') AND e.owner_id!=(SELECT owner_id FROM entities s WHERE s.kind='submissions' AND s.id=support_totals.article_id)) WHERE article_id IN (SELECT value FROM json_each(?))").bind(affected),
   env.DB.prepare("UPDATE score_totals SET points=COALESCE((SELECT sum(json_extract(head,'$.points')) FROM entities WHERE kind='scoreEvents' AND owner_id=score_totals.user_id),0)"),
   env.DB.prepare("UPDATE revision SET value=value+1 WHERE id=1")
  ]);return true;
 }
 const rows=await select(env.DB,"kind!='users' AND instr(head,?)>0",[id],{limit:2});
 if(rows.length){
  const before=await loadKeys(env.DB,rows.map(r=>r.key)),after=scrub(structuredClone(before.state),id);
  // Release active assignments. Historic decisions remain anonymous for other authors' version history.
  for(const s of after.submissions)if(s.reviewerId==="deleted"){s.reviewerId=null;if(s.status==="reviewing")s.status="submitted"}
  for(const r of after.reports)if(r.handlerId==="deleted"){r.handlerId=null;if(r.status==="reviewing")r.status="pending"}
  await save(env.DB,before,after,{publicize:(db,e,r)=>publicStatements(db,e,r,{apiBase:env.API_URL||""})});return true;
 }
 await env.DB.batch([
  env.DB.prepare("DELETE FROM records WHERE key=?").bind("users/"+id),
  env.DB.prepare("DELETE FROM blob_links WHERE entity_key=?").bind("users/"+id),
  env.DB.prepare("DELETE FROM entities WHERE key=?").bind("users/"+id),
  env.DB.prepare("DELETE FROM score_totals WHERE user_id=?").bind(id),
  env.DB.prepare("DELETE FROM auth WHERE json_extract(data,'$.userId')=? OR json_extract(data,'$.targetId')=?").bind(id,id),
  env.DB.prepare("DELETE FROM account_erasure WHERE user_id=?").bind(id),
  env.DB.prepare("DELETE FROM blobs WHERE NOT EXISTS(SELECT 1 FROM blob_links WHERE blob_links.hash=blobs.hash) AND NOT EXISTS(SELECT 1 FROM public_blob_refs WHERE public_blob_refs.hash=blobs.hash)"),
  env.DB.prepare("UPDATE revision SET value=value+1 WHERE id=1")
 ]);return true;
}
