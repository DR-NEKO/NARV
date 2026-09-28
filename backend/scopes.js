import {loadKeys,select,appendHeads,engine} from "./repository.js";
import {hydrate} from "./codec.js";
import {rank} from "../public/roles.js";
export async function actorScope(db,userId){
 const before=await loadKeys(db,["users/"+userId]);
 const user=before.state.users.find(u=>u.id===userId);if(!user||user.accountStatus==="deleting"){const e=Error("请重新登录。");e.status=401;throw e}
 const actual=await hydrate(db,user);Object.assign(user,actual);before.dependencies.push("users/"+userId);return before;
}
export async function workspaceScope(db,userId,{tab="",page=1,query="",side="review"}={}){
 const before=await actorScope(db,userId),u=before.state.users[0],offset=(Math.max(1,page)-1)*50,plans=[];
 const add=(where,args=[],limit=50,at=offset)=>plans.push(db.prepare("SELECT key,version,head FROM entities WHERE "+where+" ORDER BY updated_at DESC,key LIMIT ? OFFSET ?").bind(...args,limit,at));
 if(["","posts","reviews","applications","members"].includes(tab))add("kind='submissions' AND owner_id=?",[userId],200,0);
 if(["reviews","applications","members"].includes(tab))add("kind='submissions' AND reviewer_id=?",[userId],200,0);
 if(tab==="messages")add("kind='notifications' AND owner_id=?",[userId]);
 if(tab==="announcements")add("kind='announcements'",[],100);
 if(tab==="reviews"&&rank(u)>=1&&u.role!=="original_editor")add("kind='submissions' AND status='submitted' AND required_rank<=? AND owner_id!=?",[rank(u),userId]);
 else if(tab==="comments"&&rank(u)>=1)add("kind='comments' AND status='pending'");
 else if(tab==="my-comments")add("kind='comments' AND owner_id=?",[userId]);
 else if(tab==="bookmarks")add("kind='bookmarks' AND owner_id=?",[userId]);
 else if(tab==="reports"){add("kind='reports' AND (owner_id=? OR required_rank<=? OR reviewer_id=? OR json_extract(head,'$.authorId')=? OR json_extract(head,'$.originalReviewerId')=?)",[userId,rank(u),userId,userId,userId]);if(u.role==="original_editor")add("kind='submissions' AND status='arbitration'")}
 else if(tab==="scores")add("kind='scoreEvents' AND owner_id=?",[userId]);
 else if(tab==="applications"){add("kind='applications' AND (owner_id=? OR ? >=3)",[userId,rank(u)]);add("kind='users' AND (key IN (SELECT 'users/'||owner_id FROM entities WHERE kind='applications' AND (owner_id=? OR ?>=3)) OR id IN (SELECT json_extract(j.value,'$.userId') FROM entities a,json_each(json_extract(a.head,'$.endorsements')) j WHERE a.kind='applications' AND (a.owner_id=? OR ?>=3)))",[userId,rank(u),userId,rank(u)],250,0)}
 else if(tab==="members"&&rank(u)>=3){const q=query.trim().slice(0,80),community=side==="community"&&rank(u)>=4;add("kind='users' AND COALESCE(json_extract(head,'$.accountStatus'),'active')!='deleting' AND (?>=0) AND (?='' OR instr(lower("+(community?"community_name":"review_name")+"),lower(?))>0 OR lower(json_extract(head,'$."+(community?"community":"review")+".uid'))=lower(?) OR id=?)",[rank(u),q,q,q,q]);add("kind='accountEvents'");if(rank(u)>=4)add("kind='identityAudits'")}
 if(plans.length){const results=await db.batch(plans);for(const r of results){if(tab==="members"&&r.results.some(x=>x.key.startsWith("users/")))before.memberIds=r.results.filter(x=>x.key.startsWith("users/")).map(x=>x.key.slice(6));appendHeads(before,r.results)}if(tab==="members")before.memberIds ||= []}
 if(tab==="my-comments"){const keys=before.state.comments.map(c=>"comments/"+c.id),part=await loadKeys(db,keys);before.state.comments=part.state.comments;Object.assign(before.versions,part.versions)}
 return before;
}
export async function submissionScope(db,userId,id){
 const before=await actorScope(db,userId),part=await loadKeys(db,["submissions/"+id]);
 if(!part.state.submissions.length){const e=Error("稿件不存在。");e.status=404;throw e}
 const s=part.state.submissions[0];before.state.submissions.push(s);Object.assign(before.versions,part.versions);
 appendHeads(before,await select(db,"kind='submissions' AND owner_id=?",[s.authorId],{limit:200}));
 return before;
}
export async function commandScope(db,userId,name,args){
 const before=await actorScope(db,userId),fullKeys=new Set(),thin=[];
 const add=async(where,params,limit=50)=>{const rows=await select(db,where,params,{limit});thin.push(...rows);return rows};
 if(name==="resubmit"){fullKeys.add("submissions/"+args[0]);await add("kind=\'submissions\' AND json_extract(head,\'$.resubmissionOf\')=?",[args[0]],1)}
 if(name==="deleteDraft")fullKeys.add("submissions/"+args[0]);
 if(name==="action"){fullKeys.add("submissions/"+args[0]);if(args[1]==="review")fullKeys.add("scoreEvents/review:"+args[0]+":"+userId);if(["publish","schedule"].includes(args[1]))fullKeys.add("scoreEvents/publication:"+args[0]+":base")}
 if(name==="report")fullKeys.add("submissions/"+args[0]);
 if(["claimAccountability","resolveAccountability"].includes(name))fullKeys.add("reports/"+args[0]);
 if(name==="report")await add("kind='reports' AND owner_id=?",[userId],50);
 if(["moderateComment","editComment","withdrawComment"].includes(name))fullKeys.add("comments/"+args[0]);
 if(name==="endorse")fullKeys.add("applications/"+args[0]);
 if(["promote","revealIdentity","suspendAccount","transferOE"].includes(name))fullKeys.add("users/"+args[0]);
 if(name==="removeContent")fullKeys.add(args[0]+"/"+args[1]);
 if(name==="archiveAnnouncement")fullKeys.add("announcements/"+args[0]);
 if(name==="markRead"){
  if(args[0]==="all"){for(const r of await add("kind='notifications' AND owner_id=? AND json_extract(head,'$.read')=0",[userId],200))fullKeys.add(r.key)}
  else fullKeys.add("notifications/"+args[0]);
 }
 if(["toggleBookmark","vote","addComment"].includes(name)){
  fullKeys.add("submissions/"+args[0]);fullKeys.add("bookmarks/"+userId+":"+args[0]);fullKeys.add("votes/"+userId+":"+args[0]);
 }
 if(name==="apply")await add("kind='applications' AND owner_id=?",[userId]);

 const selected=await loadKeys(db,[...fullKeys]);
 for(const [kind,items] of Object.entries(selected.state))if(Array.isArray(items))before.state[kind].push(...items.filter(v=>!before.state[kind].some(x=>(x.id||x.userId+":"+x.articleId)===(v.id||v.userId+":"+v.articleId))));
 Object.assign(before.versions,selected.versions);
 for(const s of before.state.submissions){if(s.resubmissionOf){fullKeys.add("submissions/"+s.resubmissionOf);before.dependencies.push("submissions/"+s.resubmissionOf)}if(s.authorId)fullKeys.add("users/"+s.authorId);if(s.reviewerId)fullKeys.add("users/"+s.reviewerId)}
 for(const c of before.state.comments){fullKeys.add("users/"+c.authorId);fullKeys.add("submissions/"+c.articleId)}
 for(const a of before.state.applications)fullKeys.add("users/"+a.userId);
 for(const r of before.state.reports){fullKeys.add("submissions/"+r.articleId);fullKeys.add("users/"+r.originalReviewerId);fullKeys.add("scoreEvents/penalty:"+r.articleId+":v"+r.reportedVersion)}
 if(["vote","toggleBookmark"].includes(name))before.dependencies.push("votes/"+userId+":"+args[0],"bookmarks/"+userId+":"+args[0]);
 if(["promote","suspendAccount"].includes(name))for(const row of await add("kind='submissions' AND reviewer_id=?",[args[0]],5))fullKeys.add(row.key);
 if(["action","apply","promote","endorse","suspendAccount"].includes(name))await add("kind='users' AND role!='user'",[],10);
 if(name==="endorse"){const target=before.state.applications.find(x=>x.id===args[0])?.userId;if(target)await add("kind='submissions' AND (owner_id=? OR EXISTS(SELECT 1 FROM json_each(json_extract(head,'$.reviews')) WHERE json_extract(value,'$.reviewerId')=?))",[target,target],200)}
 thin.push(...await select(db,"kind='users' AND role='original_editor'",[],{limit:1}));
 if(name==="action"||name==="resubmit"){const id=args[0],ancestors=await db.prepare("WITH RECURSIVE lineage(key,depth) AS (SELECT 'submissions/'||json_extract(head,'$.resubmissionOf'),1 FROM entities WHERE key=? AND json_extract(head,'$.resubmissionOf') IS NOT NULL UNION ALL SELECT 'submissions/'||json_extract(e.head,'$.resubmissionOf'),l.depth+1 FROM entities e JOIN lineage l ON e.key=l.key WHERE json_extract(e.head,'$.resubmissionOf') IS NOT NULL AND l.depth<200) SELECT e.key,e.version,e.head FROM entities e JOIN lineage l ON e.key=l.key").bind("submissions/"+id).all();for(const row of ancestors.results){thin.push(row);before.dependencies.push(row.key)}}
 const dependencies=await loadKeys(db,[...fullKeys]);
 for(const [kind,items] of Object.entries(dependencies.state))if(Array.isArray(items))for(const item of items){const i=before.state[kind].findIndex(x=>(x.id||x.userId+":"+x.articleId)===(item.id||item.userId+":"+item.articleId));if(i<0)before.state[kind].push(item);else if(before.readOnly.has(kind+"/"+item.id))before.state[kind][i]=item}
 Object.assign(before.versions,dependencies.versions);
 appendHeads(before,thin);
 return before;
}
export function thinSnapshotSubmissions(data){
 return {...data,submissions:data.submissions.map(s=>({...s,content:"",images:{},workingDraft:undefined,versions:s.versions.map(v=>({version:v.version,title:v.title,date:v.date}))}))};
}
