import * as db from "./client.js";
import {rank} from "./roles.js";
import {face} from "./identity.js";
import {esc,field,area,heading,empty,when,toast} from "./ui.js";
export const FEEDBACK_TYPES={bug:"Bug 反馈",suggestion:"功能建议",user_report:"举报用户",reviewer_report:"举报审稿人",other:"其他反馈"};
const STATUS={open:"待处理",in_progress:"处理中",resolved:"已完成",closed:"已关闭"};
const options=(values,selected)=>Object.entries(values).map(([v,t])=>'<option value="'+v+'" '+(v===selected?"selected":"")+'>'+t+'</option>').join("");
const route=()=>new URL(location.hash.slice(1)||"/","https://narv.local");
const key=u=>"narv-contact-draft:"+u.id;
let receipt=null;
document.addEventListener("narv:private-cleared",()=>{receipt=null});
function pendingDraft(u){
 let d;try{d=JSON.parse(sessionStorage.getItem(key(u))||"null")}catch{}
 d ||= {requestId:crypto.randomUUID(),type:"bug",identity:"community",title:"",content:"",evidence:"",targetUid:"",relatedId:"",reviewVersion:"",reviewRound:"",contactEmail:"",pageUrl:""};
 const p=route().searchParams;if(FEEDBACK_TYPES[p.get("type")])d.type=p.get("type");if(p.has("relatedId"))d.relatedId=p.get("relatedId");if(p.has("targetUid"))d.targetUid=p.get("targetUid");if(p.has("reviewVersion"))d.reviewVersion=p.get("reviewVersion");if(p.has("reviewRound"))d.reviewRound=p.get("reviewRound");
 return d;
}
export function contactPage(){
 const u=db.session();if(!u)return heading("联系我们","Bug、功能建议与用户／审稿人举报。")+(db.authPending()?'<div class="workspace-skeleton"><div></div><div></div></div>':'<section class="panel"><p>所有反馈均需登录，只提交至私密后台，不会公开展示。</p><a class="btn primary" href="#/login?next=contact" data-contact-login>登录后反馈</a></section>');
 if(receipt?.owner===u.id&&receipt.route===location.hash)return heading("反馈已收到","内容已提交至私密后台。")+'<section class="panel"><p class="uid-tag">收件编号 '+esc(receipt.id)+'</p><p>编辑会在后台查看与处理；不会生成公开页面、评论或搜索结果。</p><p class="small-print">如需补充，请在新反馈中注明这个编号。处理意见保留在后台；填写邮箱时，编辑可按需联系你。</p><a class="btn" href="#/workspace">返回工作台</a><button class="btn primary" data-new-feedback>再提交一条反馈</button></section>';
 const d=pendingDraft(u),report=["user_report","reviewer_report"].includes(d.type);
 return '<div class="contact-page">'+heading("联系我们","反馈只进入私密后台，不公开展示。")+'<div class="contact-layout"><form id="contact-form" class="panel" novalidate><input type="hidden" name="requestId" value="'+esc(d.requestId)+'"><div class="field-group"><label class="form-field"><span>反馈类型</span><select name="type">'+options(FEEDBACK_TYPES,d.type)+'</select></label><label class="form-field"><span>使用哪套身份署名</span><select name="identity"><option value="community" '+(d.identity==="community"?"selected":"")+'>社区身份 · '+esc(face(u).name)+'</option><option value="review" '+(d.identity==="review"?"selected":"")+'>独立身份 · '+esc(face(u,"review").name)+'</option></select></label></div>'+field("标题","title",d.title,'required minlength="5" maxlength="100" placeholder="简要说明问题或建议"')+'<div data-feedback-target '+(report?"":"hidden")+'>'+field("被举报账号的 UID","targetUid",d.targetUid,'maxlength="80" placeholder="完整 C- 或 R- UID"')+'<p class="small-print">用户举报需填写 UID；举报审稿人可填写 UID 或自己的稿件编号。不指定版本与轮次时，按当前审稿人或最近一份意见定位。</p><div data-feedback-review '+(d.type==="reviewer_report"?"":"hidden")+' class="field-group">'+field("对应审稿版本（可选）","reviewVersion",d.reviewVersion||"",'type="number" min="1" max="10000" placeholder="例如 1"')+field("对应审稿轮次（可选）","reviewRound",d.reviewRound||"",'type="number" min="1" max="10000" placeholder="例如 2"')+'</div></div>'+field("相关稿件编号（可选）","relatedId",d.relatedId,'maxlength="100" placeholder="例如 N-754AEB26"')+area("详细说明","content",d.content,'required minlength="20" maxlength="10000" rows="9" placeholder="请写明问题、发生过程、预期与实际结果，或建议的功能及用途。举报请给出具体行为与依据。"')+area("补充证据、链接或日志（可选）","evidence",d.evidence,'maxlength="4000" rows="4"')+'<div class="field-group">'+field("相关页面地址（可选）","pageUrl",d.pageUrl,'type="url" maxlength="2048" placeholder="https://…"')+field("联系邮箱（可选，仅后台可见）","contactEmail",d.contactEmail,'type="email" maxlength="254"')+'</div><label class="checkline"><input type="checkbox" name="privateConsent" required><span>我确认将以上内容私密提交给具备处理权限的编辑。</span></label><div class="field-error" id="contact-error" role="alert"></div><div class="form-bottom"><span class="small-print">每个账号每天最多 5 条；失败时保留输入。</span><button class="btn primary">提交私密反馈</button></div></form><aside><section class="aside-section"><h2>私密处理</h2><p>仅具备权限的处理人员可查看。不会公开反馈正文、提交身份或内部备注，也不会放入搜索索引。</p><p>后台记录你选择的身份；不会自动附加 GitHub 昵称、邮箱或账号信息。</p></section><section class="aside-section"><h2>举报回避</h2><p>填写举报类别和定位信息后，系统会回避被举报者。举报 Editor 由 OE 处理；涉及 OE 的举报由其他 Editor 处理。</p><p>文章内容问题仍可使用文章页的“举报稿件问题”，进入原有复核流程。</p></section></aside></div></div>';
}
export function feedbackInboxPage(){
 const u=db.session();if(!u||rank(u)<4)return empty("无反馈管理权限","私密反馈仅向 Editor 及以上的合适处理人员开放。");
 if(!db.remote)return '<div class="notice">本地演示不收集私密反馈。<a href="https://dr-neko.github.io/NARV/#/contact">使用线上网站</a></div>';
 const p=route().searchParams,data=db.feedbackInbox(),type=p.get("type")||"",status=p.get("status")||"";
 const filters='<form id="feedback-filters" class="feedback-filters"><label class="form-field"><span>反馈类型</span><select name="type"><option value="">全部类型</option>'+options(FEEDBACK_TYPES,type)+'</select></label><label class="form-field"><span>处理状态</span><select name="status"><option value="">全部状态</option>'+options(STATUS,status)+'</select></label><button class="btn">筛选</button></form>';
 if(!data)return filters+empty("正在加载私密反馈","请稍后。");
 const rows=data.items.map(f=>'<a class="feedback-row" href="#/feedback/'+f.id+'"><div class="row-top"><span class="label">'+FEEDBACK_TYPES[f.type]+'</span><span class="status">'+STATUS[f.status]+'</span></div><h3>'+esc(f.title)+'</h3><div class="metadata"><span>'+when(f.createdAt)+'</span><span>'+f.id+'</span></div></a>').join("");
 const page=data.page,q=n=>"#/workspace/feedback?"+new URLSearchParams({type,status,page:n});
 return '<div class="notice">这里是私密后台。列表已过滤需要回避及权限不足的反馈；处理备注不向前台公开。</div>'+filters+(rows||empty("没有符合条件的反馈","新反馈会出现在这里，并通知合适的编辑。"))+'<nav class="page-nav">'+(page>1?'<a class="btn" href="'+esc(q(page-1))+'">上一页</a>':'')+'<span>第 '+page+' 页</span>'+(data.next?'<a class="btn" href="'+esc(q(page+1))+'">下一页</a>':'')+'</nav>';
}
export function feedbackDetailPage(id){
 const u=db.session();if(!u||rank(u)<4)return heading("私密反馈","")+empty("无反馈管理权限","普通账号无法打开反馈正文与处理记录。");
 const f=db.feedbackCase();if(f?.id===id&&f.error)return heading("私密反馈","")+empty("无法查看反馈",f.error);if(db.routeLoading()||f?.id!==id)return heading("私密反馈","")+'<div class="workspace-skeleton"><div></div><div></div></div>';
 let action="";
 if(f.status==="open")action='<button class="btn primary" data-claim-feedback="'+f.id+'" data-version="'+f.version+'">领取处理</button>';
 if(f.status==="in_progress")action=f.claimedByMe?'<form class="feedback-process-form" data-id="'+f.id+'"><input name="expectedVersion" type="hidden" value="'+f.version+'">'+area("内部处理备注","note",f.note,'required minlength="10" maxlength="5000" rows="5"')+'<div class="form-actions"><button class="btn primary" name="action" value="resolve">标为已完成</button><button class="btn" name="action" value="close">说明原因并关闭</button></div></form>':'<p class="notice">由 '+esc(f.handlerName||"另一位编辑")+' 处理中。</p>';
 if(["resolved","closed"].includes(f.status))action='<details><summary>重新打开</summary><form class="feedback-process-form" data-id="'+f.id+'"><input name="expectedVersion" type="hidden" value="'+f.version+'"><input name="action" type="hidden" value="reopen">'+area("重新打开的理由","note","",'required minlength="10" maxlength="5000"')+'<button class="btn">重新打开并交回队列</button></form></details>';
 return '<div class="feedback-detail"><a class="text-link" href="#/workspace/feedback">返回私密反馈</a>'+heading(f.title,"",'<span class="status">'+STATUS[f.status]+'</span>')+'<div class="metadata"><span>'+FEEDBACK_TYPES[f.type]+'</span><span>'+when(f.createdAt)+'</span><span>'+f.id+'</span></div><section class="panel mt"><h2>提交信息</h2><p>提交时署名：'+esc(f.reporter.name)+' · '+esc(f.reporter.uid)+'（'+(f.reporter.side==="review"?"独立身份":"社区身份")+'）</p>'+(f.targetUid?'<p>被举报身份：'+esc(f.targetLabel)+' · '+esc(f.targetUid)+'</p>':'')+(f.relatedId?'<p>相关稿件：'+esc(f.relatedId)+(f.reviewVersion?' · 第 '+f.reviewVersion+' 版':'')+(f.reviewRound?' · 第 '+f.reviewRound+' 轮':'')+'</p>':'')+(f.contactEmail?'<p>联系邮箱：'+esc(f.contactEmail)+'</p>':'')+(f.pageUrl?'<p class="feedback-url">页面地址：'+esc(f.pageUrl)+'</p>':'')+(f.highestRoleException?'<p class="notice">涉及唯一 OE，由其他 Editor 独立处理。本反馈不会授予超出原有等级的封禁或降级权限。</p>':'')+'</section><section class="panel mt"><h2>详细说明</h2><div class="feedback-body">'+esc(f.content)+'</div>'+(f.evidence?'<h3>补充证据</h3><div class="feedback-body">'+esc(f.evidence)+'</div>':'')+'</section><section class="panel mt"><h2>后台处理</h2>'+action+(f.note?'<h3>最近处理备注</h3><div class="feedback-body">'+esc(f.note)+'</div>':'')+'</section><section class="panel mt"><h2>处理记录</h2>'+(f.history.length?f.history.map(e=>'<p class="small-print">'+when(e.date)+' · '+esc(e.actor_name)+' · '+({claim:"领取",resolve:"完成",close:"关闭",reopen:"重新打开"}[e.action])+'</p>'+(e.note?'<div class="feedback-body">'+esc(e.note)+'</div>':'')).join(""):'<p class="small-print">尚未处理。</p>')+'</section></div>';
}
function remember(form){const u=db.session();if(!u)return;const data=Object.fromEntries(new FormData(form));delete data.privateConsent;try{sessionStorage.setItem(key(u),JSON.stringify(data))}catch{}}
document.addEventListener("input",e=>{const f=e.target.closest("#contact-form");if(f)remember(f)});
document.addEventListener("change",e=>{const f=e.target.closest("#contact-form");if(!f)return;f.querySelector("[data-feedback-target]").hidden=!["user_report","reviewer_report"].includes(f.elements.type.value);f.querySelector("[data-feedback-review]").hidden=f.elements.type.value!=="reviewer_report";remember(f)});
document.addEventListener("click",async e=>{
 if(e.target.closest("[data-contact-login]")){sessionStorage.setItem("narv-next","contact");return}
 if(e.target.closest("[data-new-feedback]")){receipt=null;document.dispatchEvent(new Event("narv:refresh"));return}
 const b=e.target.closest("[data-claim-feedback]");if(!b||b.disabled)return;b.disabled=true;try{await db.handleFeedback(b.dataset.claimFeedback,{action:"claim",expectedVersion:Number(b.dataset.version)});document.dispatchEvent(new Event("narv:refresh"));toast("已领取反馈")}catch(err){toast(err.message)}finally{b.disabled=false}
});
document.addEventListener("submit",async e=>{
 const f=e.target;if(f.id==="feedback-filters"){e.preventDefault();location.hash="#/workspace/feedback?"+new URLSearchParams(new FormData(f));return}
 if(f.id!=="contact-form"&&!f.matches(".feedback-process-form"))return;e.preventDefault();if(f.dataset.processing==="true")return;
 const u=db.session(),b=e.submitter||f.querySelector("button"),d=Object.fromEntries(new FormData(f));f.dataset.processing="true";b.disabled=true;
 try{
  if(f.id==="contact-form"){remember(f);const result=await db.submitFeedback({...d,privateConsent:d.privateConsent==="on"});sessionStorage.removeItem(key(u));receipt={...result,owner:u.id,route:location.hash};document.dispatchEvent(new Event("narv:refresh"));toast("私密反馈已收到")}
  else{const action=e.submitter?.value||d.action;await db.handleFeedback(f.dataset.id,{action,note:d.note||"",expectedVersion:Number(d.expectedVersion)});document.dispatchEvent(new Event("narv:refresh"));toast("反馈状态已更新")}
 }catch(err){const error=f.querySelector("#contact-error");if(error)error.textContent=err.message;else toast(err.message)}finally{delete f.dataset.processing;b.disabled=false}
});
