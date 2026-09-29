import test from "node:test";
import assert from "node:assert/strict";
import {sqlite} from "../scripts/sqlite-adapter.mjs";
import {load,save,engine} from "../backend/repository.js";
import {command,snapshot,scheduled} from "../backend/service.js";
import {initialUsers} from "../public/roles.js";
import {withIdentities} from "../public/identity.js";
import {newSession,authRoute,hash,userFromRequest,renewSession} from "../backend/auth.js";
import worker from "../backend/worker.js";
const draft={title:"真实后端测试",category:"科研与实践",summary:"检查服务端存储和权限隔离的完整流程。",content:"这是包含背景与依据的内容，用于检查只有作者能修改稿件、审稿人才能决定且作者负责最终发表。".repeat(3),consents:{original:true,privacy:true,policy:true,responsibility:true}};
async function setup(){
 const env={DB:sqlite(),FRONTEND_URL:"https://example.github.io/NARV/",API_URL:"https://api.example.workers.dev",GITHUB_CLIENT_ID:"test-client",GITHUB_CLIENT_SECRET:"test-secret",IDENTITY_PEPPER:"testing-identity-pepper-never-production-123",ORIGINAL_EDITOR_GITHUB_ID:"123"};
 const b=await load(env.DB);b.state.users=initialUsers.map(withIdentities);await save(env.DB,{...b,state:engine().state()},b.state);return env;
}
async function run(env,user,name,args){const b=await load(env.DB);return command(env,user,{name,args,revision:b.revision})}
async function published(env){
 let r=await run(env,"demo-author","create",[draft]),s=r.result;
 await run(env,"demo-author","action",[s.id,"submit",draft]);
 await run(env,"demo-temp","action",[s.id,"claim"]);
 await run(env,"demo-temp","action",[s.id,"review",{expectedVersion:1,decision:"accept",note:"核实内容与背景后，同意当前版本公开发表。",conflictFree:true}]);
 await run(env,"demo-author","action",[s.id,"publish",{publishConsent:true}]);return s.id;
}
test("API 会话校验、来源限制、服务端拒绝客户端伪造权限",async()=>{
 const env=await setup();
 try {
 const token=await newSession(env,"demo-author");
 let res=await worker.fetch(new Request(env.API_URL+"/api/command",{method:"POST",headers:{Origin:"https://example.github.io","Content-Type":"application/json"},body:JSON.stringify({name:"create",args:[draft],revision:1})}),env);assert.equal(res.status,401);
 res=await worker.fetch(new Request(env.API_URL+"/api/bootstrap",{headers:{Origin:"https://evil.example"}}),env);assert.equal(res.status,403);
 res=await worker.fetch(new Request(env.API_URL+"/api/bootstrap",{headers:{Authorization:"Bearer "+token}}),env);const data=await res.json();assert.equal(data.user.id,"demo-author");assert.equal(data.users.length,1);assert(!JSON.stringify(data).includes("test-secret"));
 await assert.rejects(run(env,"demo-author","promote",["demo-reviewer","ae","浏览器伪造角色试图提权"]),/高两级/);
 const req=new Request(env.API_URL+"/auth/logout",{method:"POST",headers:{Origin:"https://example.github.io","Content-Type":"application/json",Authorization:"Bearer "+token},body:"{}"});
 assert.equal((await worker.fetch(req,env)).status,200);assert.equal(await userFromRequest(new Request(env.API_URL,{headers:{Authorization:"Bearer "+token}}),env),null);
 }finally{env.DB.close()}
});
test("数据库持久化、并发领取冲突和隐私快照",async()=>{
 const env=await setup();try{
 const {result:s}=await run(env,"demo-author","create",[draft]);let before=await load(env.DB);
 assert.equal(before.state.submissions[0].id,s.id);
 assert.equal(snapshot(before.state,"demo-temp").submissions.length,0);
 await run(env,"demo-author","action",[s.id,"submit",draft]);before=await load(env.DB);
 const results=await Promise.allSettled(["demo-temp","demo-reviewer"].map(u=>command(env,u,{name:"action",args:[s.id,"claim"],revision:before.revision})));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
 const view=snapshot((await load(env.DB)).state,"demo-ae");assert.equal(view.users.find(u=>u.id==="demo-author").community.name,"身份受限");assert.equal(view.submissions[0].authorId,"author:"+s.id);assert(!JSON.stringify(view.submissions[0]).includes("demo-author"));
 }finally{env.DB.close()}
});
test("评论退回修改、撤回与收藏在真实存储层闭环，公开数据无主体关联",async()=>{
 const env=await setup();try{
 const id=await published(env),content="认真讨论内容，补充具体背景、证据、适用条件和局限。".repeat(8);
 await run(env,"demo-author","addComment",[id,content,true]);
 let state=(await load(env.DB)).state,c=state.comments[0];
 await assert.rejects(run(env,"demo-temp","moderateComment",[c.id,"rejected","x".repeat(2001)]),/最多/);
 await run(env,"demo-temp","moderateComment",[c.id,"rejected","改"]);
 await run(env,"demo-author","editComment",[c.id,content+"已补充来源。",true]);
 await run(env,"demo-temp","moderateComment",[c.id,"published"]);
 state=(await load(env.DB)).state;const publicData=snapshot(state);
 assert.equal(publicData.comments.length,1);assert(!Object.hasOwn(publicData.comments[0],"authorId"));assert(!Object.hasOwn(publicData.comments[0],"reviewedBy"));
 await run(env,"demo-author","toggleBookmark",[id]);
 assert.equal(snapshot((await load(env.DB)).state,"demo-author").bookmarks.length,1);
 assert.equal(snapshot((await load(env.DB)).state,"demo-temp").bookmarks.length,0);
 await run(env,"demo-author","withdrawComment",[c.id]);
 assert.equal(snapshot((await load(env.DB)).state).comments.length,0);
 }finally{env.DB.close()}
});
test("修订草稿不替换已提交正文，降级撤销访问并释放任务",async()=>{
 const env=await setup();try{
 const {result:s}=await run(env,"demo-author","create",[draft]);
 await run(env,"demo-author","action",[s.id,"submit",draft]);
 await run(env,"demo-reviewer","action",[s.id,"claim"]);
 await run(env,"demo-reviewer","action",[s.id,"review",{expectedVersion:1,decision:"revise",note:"请补充数据产生条件与具体背景。",conflictFree:true}]);
 await run(env,"demo-author","action",[s.id,"save",{...draft,content:"未提交修订文字".repeat(20)}]);
 let state=(await load(env.DB)).state;
 assert.equal(state.submissions[0].content,draft.content);
 assert(!Object.hasOwn(snapshot(state,"demo-reviewer").submissions[0],"workingDraft"));
 await run(env,"demo-original","promote",["demo-reviewer","user","权限资格变更，需要释放未完成任务。"]);
 state=(await load(env.DB)).state;assert.equal(state.submissions[0].reviewerId,null);
 assert.equal(snapshot(state,"demo-reviewer").submissions.length,0);
 }finally{env.DB.close()}
});
test("GitHub OAuth state/cookie + 双段 PKCE + 可恢复交换；不保存 GitHub token",async()=>{
 const env=await setup();try{
 const verifier="a".repeat(43),challenge=await hash(verifier);
 const start=await authRoute(new Request(env.API_URL+"/auth/github?challenge="+challenge),env);
 const location=new URL(start.headers.get("location")),cookie=start.headers.get("set-cookie").split(";")[0];
 assert.equal(location.hostname,"github.com");assert.equal(location.searchParams.get("code_challenge_method"),"S256");
 const state=location.searchParams.get("state");
 const fetcher=async(url,options)=>url.includes("access_token")?Response.json({access_token:"never-store-this-token"}):Response.json({id:555,login:"private-github-login"});
 const callback=new Request(env.API_URL+"/auth/callback?code=code&state="+state,{headers:{Cookie:cookie}});
 const redirect=await authRoute(callback,env,null,fetcher),ticket=new URL(new URL(redirect.headers.get("location")).hash.slice(1),"https://x").searchParams.get("ticket");
 const exchanged=await authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier});const {token}=await exchanged.json();
 const userId=await userFromRequest(new Request(env.API_URL,{headers:{Authorization:"Bearer "+token}}),env);
 assert(userId);
 const replay=await (await authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier})).json();assert.equal(replay.token,token);assert.equal(replay.profile.user.id,userId);
 assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM auth WHERE kind='session' AND json_extract(data,'$.userId')=?").bind(userId).first()).n,1);
 assert(replay.expiresAt>Date.now()+29*86400000);
 await authRoute(new Request(env.API_URL+"/auth/logout",{method:"POST",headers:{Authorization:"Bearer "+token}}),env);
 await assert.rejects(authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier}));
 const stateData=(await load(env.DB)).state;assert.equal(stateData.users.find(u=>u.id===userId).role,"user");assert(!JSON.stringify(stateData).includes("private-github-login"));assert(!JSON.stringify(stateData).includes("never-store"));
 await assert.rejects(authRoute(callback,env,null,fetcher));
 }finally{env.DB.close()}
});


test("后台定时发表幂等，撤回不会被重新发表",async()=>{
 const env=await setup();try{
 const {result:s}=await run(env,"demo-author","create",[draft]);
 await run(env,"demo-author","action",[s.id,"submit",draft]);
 await run(env,"demo-temp","action",[s.id,"claim"]);
 await run(env,"demo-temp","action",[s.id,"review",{expectedVersion:1,decision:"accept",note:"确认当前版本的内容足够完整，同意发表。",conflictFree:true}]);
 await run(env,"demo-author","action",[s.id,"schedule",{publishConsent:true,scheduledAt:new Date(Date.now()+3600000).toISOString()}]);
 let before=await load(env.DB),after=structuredClone(before.state);after.submissions[0].scheduledAt=new Date(Date.now()-1000).toISOString();await save(env.DB,before,after);
 await scheduled(env);before=await load(env.DB);assert.equal(before.state.submissions[0].status,"published");const count=before.state.notifications.length;
 await scheduled(env);assert.equal((await load(env.DB)).state.notifications.length,count);
 await run(env,"demo-author","action",[s.id,"retract",{note:"作者发现关键事实需要进一步核实。"}]);
 await scheduled(env);assert.equal((await load(env.DB)).state.submissions[0].status,"retracted");
 }finally{env.DB.close()}
});
test("登录错误 cookie/PKCE 被拒绝，只有指定 numeric ID 获得最高权限",async()=>{
 const env=await setup();try{
 const before=await load(env.DB),empty=engine().state();await save(env.DB,before,empty);
 const verifier="b".repeat(43),challenge=await hash(verifier);
 const start=()=>authRoute(new Request(env.API_URL+"/auth/github?challenge="+challenge),env);
 let response=await start(),state=new URL(response.headers.get("location")).searchParams.get("state");
 await assert.rejects(authRoute(new Request(env.API_URL+"/auth/callback?code=x&state="+state,{headers:{Cookie:"narv_oauth=wrong"}}),env,null,()=>{throw Error("Must not contact GitHub")}));
 response=await start();state=new URL(response.headers.get("location")).searchParams.get("state");const cookie=response.headers.get("set-cookie").split(";")[0];
 const fetcher=async url=>url.includes("access_token")?Response.json({access_token:"temporary"}):Response.json({id:123});
 response=await authRoute(new Request(env.API_URL+"/auth/callback?code=x&state="+state,{headers:{Cookie:cookie}}),env,null,fetcher);
 const ticket=new URL(new URL(response.headers.get("location")).hash.slice(1),"https://x").searchParams.get("ticket");
 await assert.rejects(authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier:"c".repeat(43)}));
 const valid=await (await authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier})).json();assert(valid.token,"invalid PKCE must not destroy a valid login ticket");
 const rows=(await load(env.DB)).state.users;assert.equal(rows.length,1);assert.equal(rows[0].role,"original_editor");
 }finally{env.DB.close()}
});


test("并行登录各自绑定 cookie；只重试 GitHub 资料读取；并发交换只建立一份会话",async()=>{
 const env=await setup();try{
 const verifier="d".repeat(43),challenge=await hash(verifier),starts=await Promise.all([1,2].map(()=>authRoute(new Request(env.API_URL+"/auth/github?challenge="+challenge),env)));
 const cookies=starts.map(s=>s.headers.get("set-cookie").split(";")[0]);
 assert.notEqual(cookies[0].split("=")[0],cookies[1].split("=")[0]);
 let reads=0,grants=0;
 const fake=async url=>{if(url.includes("access_token")){grants++;return Response.json({access_token:"not-stored"})}if(++reads===1)throw Error("transient connection");return Response.json({id:555})};
 const state=new URL(starts[0].headers.get("location")).searchParams.get("state");
 const response=await authRoute(new Request(env.API_URL+"/auth/callback?code=x&state="+state,{headers:{Cookie:cookies.join("; ")}}),env,null,fake);
 assert.equal(grants,1);assert.equal(reads,2);
 const url=new URL(new URL(response.headers.get("location")).hash.slice(1),"https://x"),ticket=url.searchParams.get("ticket");assert.equal(url.searchParams.get("attempt"),challenge);
 const ticketRow=await env.DB.prepare("SELECT expires FROM auth WHERE key=?").bind(await hash(ticket)).first();assert(ticketRow.expires>Date.now()+9*60000);
 const responses=await Promise.all([1,2].map(async()=>await (await authRoute(new Request(env.API_URL+"/auth/exchange",{method:"POST"}),env,{ticket,verifier})).json()));
 assert.equal(responses[0].token,responses[1].token);assert.equal(responses[0].profile.user.id,responses[1].profile.user.id);
 assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM auth WHERE kind='session'").first()).n,1);
 assert(!JSON.stringify((await env.DB.prepare("SELECT data FROM auth").all()).results).includes(responses[0].token));
 }finally{env.DB.close()}
});


test("旧有效会话可续为30天，失效或已退出的会话不续期",async()=>{
 const env=await setup();try{
 const token=await newSession(env,"demo-author"),key=await hash(token),request=new Request(env.API_URL+"/api/me",{headers:{Authorization:"Bearer "+token}});
 await env.DB.prepare("UPDATE auth SET expires=? WHERE key=?").bind(Date.now()+3600000,key).run();
 assert(await renewSession(request,env,"demo-author")>Date.now()+29*86400000);
 assert.equal(await renewSession(request,env,"demo-author"),undefined,"do not renew again within a day");
 await env.DB.prepare("UPDATE auth SET expires=? WHERE key=?").bind(Date.now()-1000,key).run();
 assert.equal(await renewSession(request,env,"demo-author"),undefined);
 await env.DB.prepare("DELETE FROM auth WHERE key=?").bind(key).run();assert.equal(await renewSession(request,env,"demo-author"),undefined);
 }finally{env.DB.close()}
});
