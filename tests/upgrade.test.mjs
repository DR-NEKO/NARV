import test from "node:test";
import assert from "node:assert/strict";
import {sqlite} from "../scripts/sqlite-adapter.mjs";
import {load,save,engine,loadKeys,migrateRecords} from "../backend/repository.js";
import {command,scheduled,me,bootstrap} from "../backend/service.js";
import {publicStatements,publicResponse} from "../backend/public-content.js";
import {initialUsers} from "../public/roles.js";
import {withIdentities} from "../public/identity.js";
import {loginKeyFor} from "../backend/security.js";
const draft={title:"升级验收稿件",category:"科研与实践",summary:"这是一篇完整说明实验背景和结论条件的投稿。",content:"正文包含实验方法、事实依据、局限与复现过程。".repeat(20),consents:{original:true,privacy:true,policy:true,responsibility:true}};
async function fixture(){
 const env={DB:sqlite(),API_URL:"https://example.workers.dev"},before=await load(env.DB),after=structuredClone(before.state);after.users=initialUsers.map(withIdentities);
 for(let i=0;i<12;i++)after.users.push(withIdentities({id:"reader-"+i,name:"同名读者",role:"user"}));
 await save(env.DB,before,after);return env;
}
const run=(e,u,n,a)=>command(e,u,{name:n,args:a});
async function article(e,reviewer="demo-temp"){
 const {result:s}=await run(e,"demo-author","create",[draft]);await run(e,"demo-author","action",[s.id,"submit",draft]);await run(e,reviewer,"action",[s.id,"claim"]);await run(e,reviewer,"action",[s.id,"review",{decision:"accept",note:"材料具有完整证据和边界，同意发表当前版本。",expectedVersion:1,conflictFree:true}]);await run(e,"demo-author","action",[s.id,"publish",{publishConsent:true}]);return s.id;
}
test("双身份 UID 稳定独立、同名允许、昵称 30 天冷却而头像可更新",async()=>{
 const e=await fixture();try{
 const initial=(await me(e,"reader-0")).user;
 await run(e,"reader-0","updateProfiles",[{community:{name:"共享昵称",avatar:"◈"},review:{name:"共享昵称",avatar:"◇"}}]);
 await run(e,"reader-1","updateProfiles",[{community:{name:"共享昵称",avatar:"◈"},review:{name:"共享昵称",avatar:"◇"}}]);
 await assert.rejects(run(e,"reader-0","updateProfiles",[{community:{name:"另一昵称",avatar:"◈"},review:{name:"共享昵称",avatar:"◇"}}]),/30 天/);
 await run(e,"reader-0","updateProfiles",[{community:{name:"共享昵称",avatar:"✦"},review:{name:"共享昵称",avatar:"◇"}}]);
 const updated=(await me(e,"reader-0")).user;assert.equal(updated.community.uid,initial.community.uid);assert.notEqual(updated.community.uid,updated.review.uid);assert.notEqual(updated.community.uid,(await me(e,"reader-1")).user.community.uid);
 const h=await loginKeyFor({IDENTITY_PEPPER:"fixture-only-pepper-with-long-enough-length"},"12345");assert.match(h,/^ghh:[a-f0-9]{64}$/);assert(!h.includes("12345"));
 }finally{e.DB.close()}
});
test("独立账号并行写入互不冲突，同一记录修改拒绝过期版本",async()=>{
 const e=await fixture();try{
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>run(e,"reader-"+i,"create",[draft])));assert.equal(results.filter(r=>r.status==="fulfilled").length,12);
 const key="users/reader-0",one=await loadKeys(e.DB,[key]),two=await loadKeys(e.DB,[key]),a=structuredClone(one.state),b=structuredClone(two.state);a.users[0].background="更新一";b.users[0].background="更新二";
 await save(e.DB,one,a);await assert.rejects(save(e.DB,two,b),x=>x.status===409);
 }finally{e.DB.close()}
});
test("图片跨版本与稿件按内容去重，压缩后可无损恢复，私有图不可公开",async()=>{
 const e=await fixture();try{
 const image="data:image/png;base64,iVBORw0KGgo=",d={...draft,content:draft.content+"\n![配图](narv-image:img-1)",images:{"img-1":image}};
 await run(e,"reader-0","create",[d]);await run(e,"reader-1","create",[d]);
 const blobs=await e.DB.prepare("SELECT count(*) AS n FROM blobs").first();assert.equal(blobs.n,1);
 const loaded=await load(e.DB);assert.equal(loaded.state.submissions[0].images["img-1"],image);
 const hash=(await e.DB.prepare("SELECT hash FROM blobs").first()).hash;
 assert.equal((await publicResponse(new Request(e.API_URL+"/api/public/media/"+hash),e)).status,404);
 const parts=await e.DB.prepare("SELECT data FROM records WHERE key LIKE 'submissions/%'").all();assert(parts.results.every(r=>r.data.startsWith("gz:")));assert(!JSON.stringify(parts).includes("iVBOR"));
 }finally{e.DB.close()}
});
test("举报按历史审稿权限 +1 分派，相关当事人回避，扣分仅一次并通知作者",async()=>{
 const e=await fixture();try{
 const id=await article(e),reason="这里存在具体的事实错误，实验数据与原始来源不一致，需要复核对应段落和证据。";
 const {result:r}=await run(e,"reader-0","report",[id,{reason}]);assert.equal(r.requiredRank,undefined); // reporter gets only its permitted case projection
 const caseRaw=(await load(e.DB)).state.reports[0];assert.equal(caseRaw.requiredRank,2);
 await assert.rejects(run(e,"demo-temp","claimAccountability",[caseRaw.id]),/高权限/);
 await run(e,"demo-reviewer","claimAccountability",[caseRaw.id]);await run(e,"demo-reviewer","resolveAccountability",[caseRaw.id,{verdict:"upheld",remedy:"notice",penalty:3,note:"核对原始记录后确认该段落的数据错误，但暂不足以撤稿，公开复核说明并扣除三分。",conflictFree:true}]);
 assert.equal((await me(e,"demo-temp")).points,-2);assert.equal((await me(e,"demo-author")).points,2);
 assert((await bootstrap(e,"demo-author")).notifications.some(n=>n.title==="你的稿件复核已完成"));
 const pub=await(await publicResponse(new Request(e.API_URL+"/api/public/articles/"+id),e)).json();assert(pub.article.accountabilityNotice);assert(!JSON.stringify(pub).includes("demo-author"));assert(!Object.hasOwn(pub.article,"identity"));
 const {result:r2}=await run(e,"reader-1","report",[id,{reason}]);await run(e,"demo-reviewer","claimAccountability",[r2.id]);await run(e,"demo-reviewer","resolveAccountability",[r2.id,{verdict:"upheld",remedy:"retract",penalty:5,note:"复核同一版本，确认问题达到撤稿程度，同一版本既有扣分不重复扣除。",conflictFree:true}]);assert.equal((await me(e,"demo-temp")).points,-2);
 assert.equal((await(await publicResponse(new Request(e.API_URL+"/api/public/articles/"+id),e)).json()).article.status,"retracted");
 }finally{e.DB.close()}
});
test("正式发表和审稿积分不重复；点赞收藏同人只计一次，奖励新高和单稿上限",async()=>{
 const e=await fixture();try{
 const id=await article(e);assert.equal((await me(e,"demo-temp")).points,1);assert.equal((await me(e,"demo-author")).points,2);
 for(let i=0;i<10;i++){await run(e,"reader-"+i,"vote",[id,1]);await run(e,"reader-"+i,"toggleBookmark",[id])}
 assert.equal((await e.DB.prepare("SELECT supporters FROM support_totals WHERE article_id=?").bind(id).first()).supporters,10);
 await scheduled(e);assert.equal((await me(e,"demo-author")).points,4);
 for(let i=0;i<10;i++){await run(e,"reader-"+i,"vote",[id,1]);await run(e,"reader-"+i,"toggleBookmark",[id]);await run(e,"reader-"+i,"vote",[id,1])}
 await scheduled(e);assert.equal((await me(e,"demo-author")).points,4);
 assert.equal((await e.DB.prepare("SELECT up FROM vote_totals WHERE article_id=?").bind(id).first()).up,10);
 }finally{e.DB.close()}
});
test("Editor 拒稿上诉由 OE 仲裁流程，独立 Editor 复审，OE 不能直接审稿",async()=>{
 const e=await fixture();try{
 const {result:s}=await run(e,"demo-author","create",[draft]);await run(e,"demo-author","action",[s.id,"submit",draft]);
 await assert.rejects(run(e,"demo-original","action",[s.id,"claim"]),/不可领取/);
 await run(e,"demo-editor","action",[s.id,"claim"]);await run(e,"demo-editor","action",[s.id,"review",{decision:"reject",note:"现有证据无法支撑主要结论，本轮退回。",expectedVersion:1,conflictFree:true}]);
 await run(e,"demo-author","action",[s.id,"appeal",{note:"我对当前证据和结论边界的判断提出具体异议，请求独立审稿人重新核实原始数据。"}]);
 assert.equal((await load(e.DB)).state.submissions[0].status,"arbitration");
 await run(e,"demo-original","action",[s.id,"arbitrate",{resolution:"reopen",note:"本次争议具备具体证据，安排另一位没有利益冲突的 Editor 独立复核。"}]);
 await assert.rejects(run(e,"demo-editor","action",[s.id,"claim"]),/不可领取/);
 await run(e,"demo-editor-2","action",[s.id,"claim"]);
 }finally{e.DB.close()}
});
test("5000 公共 API 冷读合并为一次数据库读取组，不触达会话或私有表",async()=>{
 const e=await fixture();try{
 const id=await article(e);let reads=0,sqls=[];const db=e.DB,counted={...db,prepare(sql){reads++;sqls.push(sql);return db.prepare(sql)}};
 let fills=0;const oldCache=globalThis.caches;globalThis.caches={default:{match:async()=>null,put:async(key,response)=>{fills++;await response.arrayBuffer()}}};let responses;
 try{responses=await Promise.all(Array.from({length:5000},()=>publicResponse(new Request(e.API_URL+"/api/public/articles/"+id),{...e,DB:counted})))}finally{if(oldCache===undefined)delete globalThis.caches;else globalThis.caches=oldCache}
 assert(responses.every(r=>r.status===200));assert.equal(fills,1);assert.equal(reads,3);assert(!sqls.some(s=>/\bauth\b|\brecords\b|\bentities\b/.test(s)));
 }finally{e.DB.close()}
});

test("定时发表满批和八阶支持奖励总计不超过免费 50 条语句，已撤稿奖励不阻塞",async()=>{
 const e=await fixture();try{
 const id=await article(e),image="data:image/png;base64,iVBORw0KGgo=",d={...draft,content:draft.content+"\\n![配图](narv-image:img-1)",images:{"img-1":image}};
 for(let i=0;i<5;i++){const {result:s}=await run(e,"demo-author","create",[d]);await run(e,"demo-author","action",[s.id,"submit",d]);await run(e,"demo-temp","action",[s.id,"claim"]);await run(e,"demo-temp","action",[s.id,"review",{decision:"accept",expectedVersion:1,conflictFree:true,note:"材料及图片已经核查，可发表当前版本。"}]);await run(e,"demo-author","action",[s.id,"schedule",{publishConsent:true,scheduledAt:new Date(Date.now()+3600000).toISOString()}])}
 const before=await load(e.DB,{hydrate:false}),after=structuredClone(before.state);for(const s of after.submissions)if(s.status==="scheduled")s.scheduledAt=new Date(Date.now()-10000).toISOString();const retired=structuredClone(after.submissions.find(s=>s.id===id));Object.assign(retired,{id:"A-retired",status:"retracted",retractionNote:"测试历史撤稿"});after.submissions.push(retired);await save(e.DB,before,after);
 await e.DB.prepare("INSERT INTO support_totals(article_id,supporters) VALUES(?,40),('A-retired',40)").bind(id).run();
 let statements=0;const DB=e.DB,counted={...DB,prepare(sql){statements++;return DB.prepare(sql)}};
 await scheduled({...e,DB:counted});assert.equal(statements,49);
 assert((await load(DB)).state.submissions.filter(s=>s.id!=="A-retired").every(s=>s.status==="published"));assert.equal((await me(e,"demo-author")).points,20);
 }finally{e.DB.close()}
});
