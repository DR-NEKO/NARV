import {createFeedback,feedbackInbox,feedbackDetail,updateFeedback} from "./feedback.js";
import {memberDetail,accountConfirmation,closeAccount} from "./account-admin.js";
import {articleState} from "./interactions.js";
import {publicResponse} from "./public-content.js";
import {authRoute,userFromRequest,renewSession} from "./auth.js";
import {load} from "./repository.js";
import {snapshot,command,scheduled,bootstrap,detail,me,reportDetail} from "./service.js";
import {hash} from "./auth.js";
async function jsonBody(request){
 const reader=request.body?.getReader();if(!reader)return {};
 let total=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1600000){await reader.cancel();throw Error("请求过大，请减少图片或正文。")}chunks.push(value)}
 const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error("请求格式不正确。")}
}
async function limit(req,env,userId){
 const interval=Math.floor(Date.now()/60000),subject=userId||req.headers.get("CF-Connecting-IP")||"local";
 const key=await hash(subject+":"+interval),row=await env.DB.prepare("INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key,Date.now()+120000).first();
 if(row.count>(userId?30:300)){const e=Error("操作过于频繁，请稍后重试。");e.status=429;throw e}
}
export default {
 async fetch(req,env,ctx) {
  const url=new URL(req.url),origin=req.headers.get("Origin"),allowed=new URL(env.FRONTEND_URL).origin;
  const headers={"Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","X-Frame-Options":"DENY"};
  if(origin===allowed)Object.assign(headers,{"Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"});
  const finish=response=>{for(const [k,v] of Object.entries(headers))if(k!=="Cache-Control"||!response.headers.has(k))response.headers.set(k,v);return response};
  try {
   if(origin&&origin!==allowed)return finish(Response.json({error:"此来源不可访问接口。"},{status:403}));
   if(req.method==="OPTIONS")return finish(new Response(null,{status:204}));
   if(!["GET","POST"].includes(req.method))return finish(new Response(null,{status:405}));
   if(req.method==="POST"&&(origin!==allowed||!req.headers.get("Content-Type")?.startsWith("application/json")))return finish(Response.json({error:"请求来源或格式不正确。"},{status:403}));
   if(url.pathname==="/health")return finish(Response.json({ok:true,authConfigured:!!env.GITHUB_CLIENT_ID&&!!env.GITHUB_CLIENT_SECRET}));
   if(url.pathname.startsWith("/api/public/")&&req.method==="GET")return finish(await publicResponse(req,env,ctx));
   if(env.MAINTENANCE==="1")return finish(Response.json({error:"正在升级数据存储，请稍后重试。登录会话与稿件将保留。"},{status:503,headers:{"Retry-After":"120"}}));
   const userId=await userFromRequest(req,env);
   if(req.method==="POST"||url.pathname==="/auth/github")await limit(req,env,userId);
   const body=req.method==="POST"?await jsonBody(req):null;
   if(url.pathname.startsWith("/auth/"))return finish(await authRoute(req,env,body)||Response.json({error:"接口不存在。"},{status:404}));
   if(url.pathname==="/api/bootstrap"&&req.method==="GET") {
    return finish(Response.json(await bootstrap(env,userId,{thin:false})));
   }
   if(url.pathname==="/api/workspace"&&req.method==="GET"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await bootstrap(env,userId,{tab:url.searchParams.get("tab")||"",page:Number(url.searchParams.get("page"))||1,query:url.searchParams.get("q")||"",side:url.searchParams.get("side")||"review",reason:url.searchParams.get("reason")||""})))}
   if(url.pathname==="/api/me"&&req.method==="GET"){return finish(Response.json({...await me(env,userId),expiresAt:await renewSession(req,env,userId)}))}
   if(url.pathname==="/api/account-confirm"&&req.method==="POST"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await accountConfirmation(env,userId,body)))}
   if(url.pathname==="/api/account-close"&&req.method==="POST"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await closeAccount(env,userId,body)))}
   if(url.pathname==="/api/feedback"){if(!userId)return finish(Response.json({error:"请先登录后提交或管理反馈。"},{status:401}));if(req.method==="POST")return finish(Response.json(await createFeedback(env,userId,body)));return finish(Response.json(await feedbackInbox(env,userId,{type:url.searchParams.get("type")||"",status:url.searchParams.get("status")||"",page:url.searchParams.get("page")||1})))}
   const feedbackId=url.pathname.match(/^\/api\/feedback\/(F-[a-f0-9-]{36})$/);
   if(feedbackId){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(req.method==="GET"?await feedbackDetail(env,userId,feedbackId[1]):await updateFeedback(env,userId,feedbackId[1],body)))}
   const memberId=url.pathname.match(/^\/api\/members\/([^/]+)$/);
   if(memberId&&req.method==="GET"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await memberDetail(env,userId,memberId[1])))}
   const interaction=url.pathname.match(/^\/api\/article-state\/([^/]+)$/);
   if(interaction&&req.method==="GET"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await articleState(env,userId,interaction[1])))}
   const caseId=url.pathname.match(/^\/api\/reports\/([^/]+)$/);
   if(caseId&&req.method==="GET"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await reportDetail(env,userId,caseId[1])))}
   const target=url.pathname.match(/^\/api\/submissions\/([^/]+)$/);
   if(target&&req.method==="GET"){if(!userId)return finish(Response.json({error:"请先登录。"},{status:401}));return finish(Response.json(await detail(env,userId,target[1],url.searchParams.has("version")?url.searchParams.get("version"):undefined)))}
   if(url.pathname==="/api/command"&&req.method==="POST"){
    if(!userId)return finish(Response.json({error:"登录已过期，请重新登录。"},{status:401}));
    return finish(Response.json(await command(env,userId,body)));
   }
   return finish(Response.json({error:"接口不存在。"},{status:404}));
  }catch(error){
   const internal=/SQLITE|D1_|no such|constraint|database|fetch failed/i.test(error.message);
   if(url.pathname==="/auth/callback"){
    const target=new URL(env.FRONTEND_URL);target.hash="/login?error="+encodeURIComponent(internal?"登录连接暂时中断，请重试。":/timeout|aborted/i.test(error.message)?"GitHub 响应超时，请重新登录。":error.message);
    return finish(new Response(null,{status:302,headers:{Location:target.href}}));
   }
   return finish(Response.json({error:internal?"服务暂时不可用，请稍后重试。":error.message},{status:error.status|| (internal?503:400)}));
  }
 },
 async scheduled(event,env,ctx){if(env.MAINTENANCE!=="1")ctx.waitUntil(scheduled(env))}
};
