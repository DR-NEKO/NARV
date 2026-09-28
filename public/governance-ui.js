import * as db from "./client.js";
import {esc,area,field,when,empty,toast,markdown} from "./ui.js";
import {rank,ROLE_NAMES} from "./roles.js";
import {canHandleReport} from "./accountability.js";
const reportLabel={pending:"等待复核",reviewing:"复核中",upheld:"举报成立",dismissed:"举报不成立"};
export function reportForm(article,u){
 if(!u||article.status!=="published")return "";
 return '<details class="report-entry"><summary>举报稿件问题</summary><form class="report-form" data-id="'+article.id+'"><p class="small-print">请指出可核实的问题与证据。由高于批准该版本审稿人的权限账号处理，相关当事人回避。</p>'+area("具体问题与证据","reason","",'required minlength="30" maxlength="5000" placeholder="请说明具体位置、事实依据和影响，避免仅表达不赞同。"')+area("补充来源或链接（可选）","evidence","",'maxlength="2000"')+'<button class="btn">提交举报</button></form></details>';
}
export function scoreUI(u){
 const list=db.scores(u),points=db.points(u);
 return '<section class="score-overview"><div><span class="eyebrow">个人贡献积分</span><strong>'+points+'</strong><p>用于权限申请时的参考，不替代材料与人工认可。</p></div><ul><li>同稿同审稿人完成审阅 +1</li><li>正式发表 +2，读者支持奖励累计至单稿 10 分</li><li>确有问题的审稿可经复核扣 2–5 分</li></ul></section><h2 class="section-label">积分记录</h2>'+(list.length?'<div class="score-ledger">'+list.map(e=>'<article class="score-row"><strong class="'+(e.points<0?"negative":"positive")+'">'+(e.points>0?"+":"")+e.points+'</strong><div><p>'+esc(e.reason)+'</p><span class="small-print">'+when(e.date)+'</span></div></article>').join("")+'</div>':empty("暂时没有积分记录","发表稿件或完成合格审稿后，记录会出现在这里。"));
}
export function reportsUI(u){
 const list=db.reports(u);
 return '<div class="notice">举报只向相关当事人与符合复核权限的账号展示。OE 不做普通审稿，可处理最高层级的复核与追责。</div>'+(list.length?list.map(r=>'<article class="case-card"><div class="metadata"><span class="label">'+reportLabel[r.status]+'</span><span>'+when(r.createdAt)+'</span></div><h2><a href="#/report/'+r.id+'">'+esc(r.articleTitle)+'</a></h2><p>'+esc(r.reason)+'</p><a class="text-link" href="#/report/'+r.id+'">查看举报与处理记录 →</a></article>').join(""):empty("没有可查看的举报","自己提交的举报、相关处理结果和符合权限的待办会显示在这里。"));
}
export function reportDetailUI(r,u){
 const can=canHandleReport(r,u),handler=r.handlerId===u.id;
 return '<div class="case-detail"><a class="text-link" href="#/workspace/reports">返回举报与复核</a><h1>'+esc(r.articleTitle)+'</h1><div class="metadata"><span class="label">'+reportLabel[r.status]+'</span><span>'+when(r.createdAt)+'</span></div><section class="panel mt"><h2>具体问题</h2><div class="prose">'+markdown(r.reason)+'</div>'+(r.evidence?'<h3>补充来源</h3><p>'+esc(r.evidence)+'</p>':'')+'<a class="text-link" href="#/article/'+r.articleId+'">阅读稿件 →</a></section>'+(r.originalReviewerName?'<section class="panel mt"><h2>复核条件</h2><p>批准第 '+r.reportedVersion+' 版的审稿人：'+esc(r.originalReviewerName)+' · '+ROLE_NAMES[r.originalReviewerRole]+'</p><p>需要 '+ROLE_NAMES[Object.keys(ROLE_NAMES)[r.requiredRank]]+' 及以上，并回避作者、举报人和原审稿人。</p></section>':'')+(r.status==="pending"&&can?'<button class="btn primary mt" data-claim-report="'+r.id+'">领取复核任务</button>':'')+(r.status==="reviewing"&&handler?'<section class="panel mt"><h2>复核决定</h2><form class="report-decision-form" data-id="'+r.id+'"><label class="form-field"><span>证据判断</span><select name="verdict"><option value="upheld">举报成立</option><option value="dismissed">举报不成立</option></select></label><div class="field-group"><label class="form-field"><span>稿件处理</span><select name="remedy"><option value="caution">caution · 争议提示，继续公开</option><option value="temporary_down">temporary down · 暂时下架，修订后重审</option><option value="ban">ban · 永久下架，禁止修改和重投</option><option value="nothing">nothing · 不采取内容措施</option></select></label><label class="form-field"><span>原审稿人积分处理</span><select name="penalty"><option value="0">不扣分</option><option value="2">扣 2 分</option><option value="3">扣 3 分</option><option value="4">扣 4 分</option><option value="5">扣 5 分</option></select></label></div>'+area("具体依据与处理理由","note","",'required minlength="20" maxlength="5000"')+'<label class="checkline"><input name="conflictFree" type="checkbox" required><span>我确认不存在利益冲突，并对这次处理判断负责。</span></label><button class="btn primary">提交复核决定</button></form></section>':'')+(r.verdictNote?'<section class="panel mt"><h2>处理结果</h2><p>'+esc(r.verdictNote)+'</p>'+(r.penalty!==undefined?'<p>积分扣除：'+(r.penaltyApplied?r.penalty:"未追加扣分")+'</p>':'')+'</section>':'')+'</div>';
}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-claim-report]");if(!b)return;try{b.disabled=true;await db.claimAccountability(db.session(),b.dataset.claimReport);document.dispatchEvent(new Event("narv:refresh"))}catch(error){toast(error.message)}finally{b.disabled=false}});
document.addEventListener("submit",async e=>{
 const form=e.target;if(!form.matches(".report-form,.report-decision-form"))return;e.preventDefault();const b=form.querySelector("button");if(b.disabled)return;b.disabled=true;
 try{const d=Object.fromEntries(new FormData(form));if(form.matches(".report-form")){await db.report(db.session(),form.dataset.id,d);location.hash="#/workspace/reports"}else{await db.resolveAccountability(db.session(),form.dataset.id,{...d,conflictFree:d.conflictFree==="on"});document.dispatchEvent(new Event("narv:refresh"))}toast("已记录并提交")}catch(error){toast(error.message)}finally{b.disabled=false}
});
