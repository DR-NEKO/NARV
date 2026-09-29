import * as db from "./client.js";
import {reviewKey} from "./review-replies.js";
import {canEdit} from "./workflow.js";
import {esc,toast} from "./ui.js";
export function replyUI(s,r,itemId,u){
 const key=reviewKey(r),sent=(s.reviewReplies||[]).filter(x=>x.reviewKey===key&&x.itemId===itemId);
 const draft=(s.reviewReplyDrafts||[]).find(x=>x.reviewKey===key&&x.itemId===itemId);
 let html=sent.map(x=>'<div class="author-review-reply"><strong>作者回复 · 随第 '+x.submittedVersion+' 版提交</strong><p>'+esc(x.text)+'</p></div>').join("");
 if(s.authorId===u?.id&&canEdit(s,u))html+='<form class="review-reply-form" data-id="'+esc(s.id)+'" data-review-key="'+esc(key)+'" data-item-id="'+esc(itemId)+'"><label class="form-field"><span>逐条回复'+(itemId==="overall"?" · 总意见":"")+'</span><textarea name="replyText" rows="3" maxlength="5000" placeholder="说明如何修改，或解释保留原文的理由。">'+esc(draft?.text||"")+'</textarea></label><div class="form-actions"><button class="btn" type="submit">保存回复草稿</button><span class="small-print reply-save-state">'+(draft?"已保存；随下一版修订稿提交":"仅作者可见，随修订稿提交后发送")+'</span></div></form>';
 return html;
}
export function assertReplyFormsSaved(){
 for(const form of document.querySelectorAll(".review-reply-form")){
  if(form.dataset.dirty==="true")throw Error("请先保存逐条回复草稿，再提交修订稿。");
 }
}
document.addEventListener("input",e=>{const form=e.target.closest(".review-reply-form");if(form){form.dataset.dirty="true";form.querySelector(".reply-save-state").textContent="回复尚未保存"}});
document.addEventListener("submit",async e=>{
 const form=e.target;if(!form.matches(".review-reply-form"))return;e.preventDefault();
 if(form.dataset.processing==="true")return;form.dataset.processing="true";const button=form.querySelector("button");button.disabled=true;
 const text=form.elements.replyText.value;
 try{
  const s=db.get(form.dataset.id,db.session());
  await db.action(s.id,"reply_save",db.session(),{reviewKey:form.dataset.reviewKey,itemId:form.dataset.itemId,text,expectedVersion:s.version});
  if(form.elements.replyText.value===text){delete form.dataset.dirty;form.querySelector(".reply-save-state").textContent="已保存；随下一版修订稿提交"}
  toast("回复草稿已保存");
 }catch(error){toast(error.message)}finally{delete form.dataset.processing;button.disabled=false}
});
