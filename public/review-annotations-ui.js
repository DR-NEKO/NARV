import {replyUI} from "./review-replies-ui.js";
import * as db from "./client.js";
import {canReview} from "./workflow.js";
import {reviewBlocks} from "./markdown.js";
import {esc,markdown,toast,when} from "./ui.js";
let key="",selected=null,pending=null,note="",editing="",dialog=null;
const current=()=>{const id=location.hash.match(/^#\/(?:submission|edit)\/([^/?]+)/)?.[1];return id?db.get(id,db.session()):null};
const editable=s=>s?.status==="reviewing"&&s.reviewerId===db.session()?.id&&canReview(s,db.session());
function reset(){selected=pending=null;note="";editing="";document.querySelector(".review-selection-action")?.remove()}
export function assertAnnotationsSaved(){if(pending)throw Error("请先保存或取消正在编辑的批注，再提交审稿决定。")}
export function annotationPanel(s,u){
 if(!editable(s))return "";
 const next=[s.id,s.version,s.round,u.id].join(":");if(next!==key){reset();key=next}
 const rows=(s.reviewAnnotations||[]).filter(a=>a.reviewerId===u.id&&a.version===s.version&&a.round===s.round),older=(s.reviewAnnotations||[]).filter(a=>a.reviewerId===u.id&&!rows.includes(a));
 return '<section class="review-annotations panel mt"><div class="row-top"><h2>原文批注 <span class="count">'+rows.length+'</span></h2><button class="btn" type="button" data-add-annotation>选中原文后添加批注</button></div><p class="small-print">第 '+s.version+' 版 · 第 '+s.round+' 轮。批注草稿仅你可见，提交审稿决定时一起发送给作者。按原文片段定位，不使用屏幕行号。</p><div id="annotation-editor">'+editorUI()+'</div><div class="annotation-list">'+(rows.length?rows.map(a=>card(s.id,a,true)).join(""):'<p class="small-print">尚无批注。可在上方正文中选中一段文字，再添加意见。</p>')+'</div>'+(older.length?'<details class="annotation-older"><summary>其他版本／轮次的私密批注草稿（'+older.length+'）</summary>'+older.map(a=>card(s.id,a,false)).join("")+'<p class="small-print">这些批注仍绑定原版本，不会随本轮决定发送。</p></details>':'')+'</section>';
}
function card(id,a,edit=false){return '<article class="annotation-card" data-annotation="'+esc(a.id)+'"><div class="row-top"><span class="small-print">第 '+a.version+' 版 · 第 '+a.round+' 轮</span><button class="text-link" type="button" data-locate-annotation="'+esc(a.id)+'" data-manuscript="'+id+'">定位原文</button></div><blockquote>'+esc(a.anchor.quote)+'</blockquote><p class="annotation-note">'+esc(a.note)+'</p>'+(edit?'<div class="form-actions"><button class="text-link" type="button" data-edit-annotation="'+a.id+'">修改批注</button><button class="text-link danger" type="button" data-delete-annotation="'+a.id+'">删除批注</button></div>':'')+'</article>'}
export const finalAnnotationList=(id,review,s,u)=>review.annotations?.length?'<section class="final-annotations"><h4>原文批注（'+review.annotations.length+'）</h4>'+review.annotations.map(a=>card(id,a)+(s?replyUI(s,review,a.id,u):"")).join("")+'</section>':"";
function editorUI(){return pending?'<form id="review-annotation-form"><label class="form-field"><span>选中的原文</span><blockquote class="annotation-quote">'+esc(pending.quote)+'</blockquote></label><label class="form-field"><span>批注意见</span><textarea name="annotationNote" rows="4" maxlength="2000">'+esc(note)+'</textarea></label><div class="field-error" id="annotation-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">保存批注草稿</button><button class="btn" type="button" data-locate-pending>定位原文</button><button class="btn" type="button" data-cancel-annotation>取消</button></div></form>':""}
function editorRender(){const slot=document.querySelector("#annotation-editor");if(slot)slot.innerHTML=editorUI()}
function plain(node){
 if(node.nodeType===3)return node.textContent;
 if(node.nodeType!==1&&node.nodeType!==11)return "";
 if(node.hasAttribute?.("data-review-ignore"))return "";
 if(node.dataset?.reviewText!==undefined)return node.dataset.reviewText;
 if(node.nodeName==="BR")return "\n";if(node.nodeName==="IMG")return "";
 let text="",previous=null;
 for(const child of node.childNodes){let part=plain(child);if(previous?.nodeName==="BR"&&child.nodeType===3&&part.startsWith("\n"))part=part.slice(1);if(child.nodeType===3&&!part.trim()&&["PRE","DIV"].includes(previous?.nodeName))part="";text+=part;previous=child}
 return text;
}
const parent=node=>node.nodeType===1?node:node.parentElement;
function prefixOffset(block,node,offset){const range=document.createRange();range.selectNodeContents(block);range.setEnd(node,offset);return plain(range.cloneContents()).length}
export function selectedAnchor(){
 const s=current(),selection=window.getSelection();if(!editable(s)||!selection?.rangeCount||selection.isCollapsed)return null;
 const range=selection.getRangeAt(0),startElement=parent(range.startContainer),endElement=parent(range.endContainer),block=startElement?.closest("[data-review-block]");
 if(!block||!block.closest("#submission-body")||block!==endElement?.closest("[data-review-block]"))return null;
 if(startElement.closest(".review-atom,[data-review-ignore]")||endElement.closest(".review-atom,[data-review-ignore]"))return null;
 const model=reviewBlocks(s.content).find(b=>b.id===block.dataset.reviewBlock);if(!model||plain(block)!==model.text)return null;
 const start=prefixOffset(block,range.startContainer,range.startOffset),end=prefixOffset(block,range.endContainer,range.endOffset);
 if(end<=start||end-start>1000)return null;
 return {blockId:model.id,start,end,quote:model.text.slice(start,end)};
}
function capture(){
 const anchor=selectedAnchor();if(!anchor)return;selected=anchor;
 let button=document.querySelector(".review-selection-action");
 if(!button){button=document.createElement("button");button.type="button";button.className="btn primary review-selection-action";button.dataset.addAnnotation="";button.textContent="为选中原文添加批注";document.body.append(button)}
}
function findAnnotation(s,id){return [...(s.reviewAnnotations||[]),...(s.reviews||[]).flatMap(r=>r.annotations||[])].find(a=>a.id===id)}
function pointAt(block,offset){
 const walk=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest(".review-atom,[data-review-ignore]")?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 let n;while(n=walk.nextNode()){const start=prefixOffset(block,n,0),end=prefixOffset(block,n,n.length);if(offset>=start&&offset<=end){let pos=offset-start;if(n.previousSibling?.nodeName==="BR"&&n.data.startsWith("\n"))pos++;return [n,Math.min(pos,n.length)]}}
 return null;
}
function locate(root,annotation){
 root.querySelectorAll(".annotation-target").forEach(e=>e.classList.remove("annotation-target"));
 const block=[...root.querySelectorAll("[data-review-block]")].find(e=>e.dataset.reviewBlock===annotation.anchor.blockId);
 if(!block)throw Error("该片段不在当前版本中，请查看批注绑定的原版本。");
 block.classList.add("annotation-target");block.scrollIntoView({block:"center",behavior:"smooth"});
 const a=pointAt(block,annotation.anchor.start),b=pointAt(block,annotation.anchor.end);
 if(a&&b){const range=document.createRange();range.setStart(...a);range.setEnd(...b);window.getSelection().removeAllRanges();window.getSelection().addRange(range)}
}
async function locateAnnotation(s,a){
 if(a.version===s.version&&document.querySelector("#submission-body")){locate(document.querySelector("#submission-body"),a);return}
 const version=await db.version(s.id,a.version,db.session());
 dialog?.remove();dialog=document.createElement("dialog");dialog.className="review-version-dialog";
 dialog.innerHTML='<div class="row-top"><h2>第 '+a.version+' 版原文</h2><button class="btn" type="button" data-close-annotation-version>关闭</button></div><div class="notice">批注绑定的是这个提交版本，未自动移动到修改后的正文。</div><div class="prose">'+markdown(version.content,version.images,{annotatable:true})+'</div>';
 document.body.append(dialog);dialog.showModal();locate(dialog,a);
}
document.addEventListener("mouseup",capture);document.addEventListener("touchend",capture);
document.addEventListener("input",e=>{if(e.target.name==="annotationNote")note=e.target.value});
document.addEventListener("click",async e=>{
 try{
  const button=e.target.closest("[data-annotate-block],[data-add-annotation],[data-edit-annotation],[data-delete-annotation],[data-locate-annotation],[data-cancel-annotation],[data-close-annotation-version],[data-locate-pending]");if(!button)return;
  if(button.hasAttribute("data-close-annotation-version")){dialog?.remove();dialog=null;return}
  const s=current();if(!s)return;
  if(button.hasAttribute("data-locate-pending")){if(pending)locate(document.querySelector("#submission-body"),{anchor:pending});return}
  if(button.hasAttribute("data-cancel-annotation")){reset();editorRender();return}
  if(button.hasAttribute("data-locate-annotation")){const a=findAnnotation(s,button.dataset.locateAnnotation);if(a)await locateAnnotation(s,a);return}
  if(!editable(s))throw Error("当前稿件已不属于你正在审阅的版本。");
  if(button.hasAttribute("data-annotate-block")){const block=reviewBlocks(s.content).find(b=>b.id===button.dataset.annotateBlock);if(!block||block.text.length>1000)throw Error("这段原文超过 1000 字，请选中其中需要批注的片段。");selected={blockId:block.id,start:0,end:block.text.length,quote:block.text}}
  if(button.hasAttribute("data-add-annotation")||button.hasAttribute("data-annotate-block")){
   if(pending){document.querySelector('[name="annotationNote"]')?.focus();return}
   const anchor=selected||selectedAnchor();if(!anchor)throw Error("请在同一段原文中选中 1–1000 字；公式可连同前后文字一起选择。");
   pending=anchor;note="";editing="";document.querySelector(".review-selection-action")?.remove();editorRender();document.querySelector("#review-annotation-form")?.scrollIntoView({block:"center",behavior:"smooth"});document.querySelector('[name="annotationNote"]')?.focus();return;
  }
  const id=button.dataset.editAnnotation||button.dataset.deleteAnnotation,a=findAnnotation(s,id);if(!a)return;
  if(button.hasAttribute("data-edit-annotation")){pending=a.anchor;note=a.note;editing=a.id;editorRender();document.querySelector('[name="annotationNote"]')?.focus();return}
  button.disabled=true;await db.action(s.id,"annotation_delete",db.session(),{id:a.id,expectedVersion:s.version,expectedRound:s.round});document.dispatchEvent(new Event("narv:refresh"));toast("批注草稿已删除");
 }catch(error){toast(error.message)}
});
document.addEventListener("submit",async e=>{
 if(e.target.id!=="review-annotation-form")return;e.preventDefault();const form=e.target,s=current();if(!s||!pending||form.dataset.processing==="true")return;
 form.dataset.processing="true";form.querySelector('[type="submit"]').disabled=true;
 try{await db.action(s.id,"annotation_save",db.session(),{id:editing||undefined,anchor:pending,note,expectedVersion:s.version,expectedRound:s.round});reset();document.dispatchEvent(new Event("narv:refresh"));toast("批注草稿已保存，提交审稿决定时发送")}
 catch(error){const target=document.querySelector("#annotation-error");if(target)target.textContent=error.message}
 finally{if(form.isConnected){form.dataset.processing="false";form.querySelector('[type="submit"]').disabled=false}}
});
document.addEventListener("narv:submission-inaccessible",()=>{reset();dialog?.remove();dialog=null});
document.addEventListener("narv:private-cleared",()=>{reset();key="";dialog?.remove();dialog=null});

export function installAnnotationButtons(s){
 if(!editable(s))return;
 const root=document.querySelector("#submission-body");if(!root)return;
 for(const block of root.querySelectorAll("[data-review-block]")){
  block.classList.add("review-annotatable-block");const button=document.createElement("button");
  button.type="button";button.className="review-block-button";button.dataset.annotateBlock=block.dataset.reviewBlock;button.dataset.reviewIgnore="";button.setAttribute("aria-label","为整段原文添加批注");button.title="批注整段";button.textContent="＋";if(!block.querySelector(".review-block-button"))block.append(button);
 }
}

document.addEventListener("narv:comparison-rendered",()=>{const s=current();if(s)installAnnotationButtons(s)});
window.addEventListener("hashchange",()=>{selected=null;document.querySelector(".review-selection-action")?.remove()});
