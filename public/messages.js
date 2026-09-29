import {rank} from "./roles.js";
export function makeNotification(userId,title,body,link,kind="review"){return {id:crypto.randomUUID(),userId,title,body,link,kind,read:false,date:new Date().toISOString()}}
export function eventNotifications(before,after,action,actor,users){const items=[],to=(id,title,body,kind="review")=>{if(id&&id!==actor?.id)items.push(makeNotification(id,title,body,"#/submission/"+after.id,kind))},title=after.title||"未命名稿件";
if(action==="submit"){if(after.reviewerId)to(after.reviewerId,"收到修订稿",title+" · 第 "+after.version+" 版");else users.filter(u=>u.id!==after.authorId&&rank(u)>=after.requiredRank).forEach(u=>to(u.id,"有新稿件可审阅",title))}
if(action==="claim")to(after.authorId,"稿件已进入审阅",title);
if(action==="review")to(after.authorId,after.status==="accepted"?"稿件已通过，可安排发表":after.status==="revision"?"收到修改意见":"收到本轮审稿决定",title+" · 请进入稿件页查看完整意见。");
if(action==="appeal")users.filter(u=>u.id!==after.authorId&&rank(u)>=after.requiredRank&&!after.conflicts.includes(u.id)).forEach(u=>to(u.id,"收到高一级复审请求",title));
if(action==="request"){if(after.reviewerId)to(after.reviewerId,"作者申请修改或撤回",title);users.filter(u=>rank(u)>=3&&u.id!==after.reviewerId).forEach(u=>to(u.id,"作者有待处理的申请",title))}
if(action==="resolve")to(after.authorId,"稿件申请已处理",title);
if(action==="withdraw"&&!(after.reviews||[]).length){const id=before.reviewerId;if(id&&id!==actor?.id)items.push(makeNotification(id,"审稿任务已取消","作者已撤回一篇尚无审稿意见的稿件。","#/workspace/reviews"))}else if(["withdraw","retract"].includes(action))to(after.reviewerId,"作者已撤回稿件",title);
if(action==="publish")to(after.reviewerId,"审阅的稿件已发表",title,"community");
if(action==="recuse")to(after.authorId,"审稿人已回避",title+" · 稿件已回到待审队列。");
return items}
