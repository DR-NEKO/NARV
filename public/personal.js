import * as db from "./client.js";
import {esc,empty,when,markdown,area,toast} from "./ui.js";
import {STATUS} from "./roles.js";
const labels={pending:"待审核",published:"已公开",rejected:"需修改",withdrawn:"已撤回"};
const tools=options=>'<div class="personal-tools"><input type="search" data-personal-query aria-label="筛选我的内容" placeholder="在这些内容中查找…"><select data-personal-status aria-label="按状态筛选"><option value="">全部状态</option>'+options.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join("")+'</select></div>';
const articleCard=(a,extra="")=>'<article class="personal-card" data-personal-item data-status="'+a.status+'"><div class="metadata">'+esc(a.category)+' · '+esc(a.date)+' · '+(a.status==="retracted"?"已撤稿":"已发表")+'</div><h2><a href="#/article/'+a.id+'">'+esc(a.title)+'</a></h2><p>'+esc(a.summary)+'</p><div class="form-actions"><a class="text-link" href="#/article/'+a.id+'">阅读帖子 →</a>'+extra+'</div></article>';
export function personalUI(tab,u){
 if(tab==="posts"){
  const ids=new Set(db.all().filter(s=>s.authorId===u.id).map(s=>s.id)),list=db.publicArticles().filter(a=>ids.has(a.id));
  return '<h2 class="section-label">已发表帖子 · '+list.length+'</h2><p class="small-print">这里展示公开阅读页；审稿与发表安排在“我的投稿”中管理。</p>'+tools([["published","已发表"],["retracted","已撤稿"]])+(list.length?list.map(a=>articleCard(a,'<a class="text-link" href="#/submission/'+a.id+'">管理稿件</a>')).join(""):empty("还没有已发表帖子","稿件录用后，由你选择发表时间。"));
 }
 if(tab==="bookmarks"){
  const all=db.publicArticles(),saved=db.bookmarks(u).slice().sort((a,b)=>b.date.localeCompare(a.date));
  return '<h2 class="section-label">我的收藏 · '+saved.length+'</h2>'+tools([["published","可阅读"],["retracted","已撤稿"]])+(saved.length?saved.map(b=>{const a=all.find(a=>a.id===b.articleId);return a?articleCard(a,'<button class="text-link" data-remove-bookmark="'+a.id+'">取消收藏</button>'):'<article class="personal-card" data-personal-item><h2>原文暂不可访问</h2><button class="text-link" data-remove-bookmark="'+esc(b.articleId)+'">移除收藏记录</button></article>'}).join(""):empty("还没有收藏文章","在阅读页收藏文章，稍后可以在这里重读。"));
 }
 const list=db.myComments(u),articles=db.publicArticles();
 return '<h2 class="section-label">我的评论 · '+list.length+'</h2><p class="small-print">查看审核进度、退回理由与历史意见。修改后需重新确认并接受审核。</p>'+tools(Object.entries(labels))+(list.length?list.map(c=>{
 const a=articles.find(a=>a.id===c.articleId);
 return '<article class="personal-card" data-personal-item data-status="'+c.status+'"><div class="metadata"><span class="label">'+labels[c.status]+'</span>第 '+(c.version||1)+' 版 · '+when(c.updatedAt||c.createdAt)+'</div><h2><a href="#/article/'+c.articleId+'?comment='+c.id+'">'+esc(a?.title||"原文暂不可访问")+'</a></h2><div class="prose">'+markdown(c.content)+'</div>'+(c.reviewNote?'<div class="notice">审核意见：'+esc(c.reviewNote)+'</div>':'')+(c.history?.length?'<details><summary>查看审核记录</summary>'+c.history.map(h=>'<p>第 '+h.version+' 版 · '+(h.decision==="published"?"通过":"退回")+'：'+esc(h.note||"已通过审核")+'</p>').join("")+'</details>':'')+'<div class="form-actions mt"><a class="text-link" href="#/article/'+c.articleId+'?comment='+c.id+'">查看原文与评论</a>'+(c.status!=="withdrawn"?'<button class="text-link danger" data-withdraw-comment="'+c.id+'">撤回评论</button>':'')+'</div>'+(['pending','rejected','withdrawn'].includes(c.status)&&a?.status==="published"?'<details class="mt"><summary>修改并重新提交</summary><form class="comment-edit-form" data-id="'+c.id+'">'+area("评论正文","content",c.content,'required minlength="100" maxlength="5000"')+'<label class="checkline"><input name="consent" type="checkbox" required><span>评论仅代表本人观点；我已阅读投稿须知并对内容与权利来源负责。</span></label><button class="btn primary">重新提交审核</button></form></details>':'')+'</article>';
 }).join(""):empty("还没有发表评论","文章页可提交 100–5000 字的中长评论，审核后公开。"));
}
function filter(){const q=document.querySelector("[data-personal-query]")?.value.toLocaleLowerCase()||"",status=document.querySelector("[data-personal-status]")?.value||"";document.querySelectorAll("[data-personal-item]").forEach(el=>el.hidden=!!((status&&el.dataset.status!==status)||!el.textContent.toLocaleLowerCase().includes(q)))}
document.addEventListener("input",e=>{if(e.target.matches("[data-personal-query],[data-personal-status]"))filter()});
document.addEventListener("click",async e=>{
 const bookmark=e.target.closest("[data-remove-bookmark]"),withdraw=e.target.closest("[data-withdraw-comment]");if(!bookmark&&!withdraw)return;
 try{if(bookmark)await db.toggleBookmark(db.session(),bookmark.dataset.removeBookmark);else {if(!confirm("撤回这条评论？它将不再公开或参与搜索。"))return;await db.withdrawComment(db.session(),withdraw.dataset.withdrawComment)}document.dispatchEvent(new Event("narv:refresh"));toast("已更新")}catch(err){toast(err.message)}
});
document.addEventListener("submit",async e=>{
 const form=e.target;if(!form.matches(".comment-edit-form,.comment-reject-form"))return;e.preventDefault();
 const button=form.querySelector("button");if(button.disabled)return;button.disabled=true;
 try{const d=new FormData(form);if(form.matches(".comment-edit-form"))await db.editComment(db.session(),form.dataset.id,d.get("content"),d.get("consent")==="on");else await db.moderateComment(db.session(),form.dataset.id,"rejected",d.get("note"));document.dispatchEvent(new Event("narv:refresh"));toast("已提交")}catch(err){toast(err.message)}finally{button.disabled=false}
});
