import * as db from "./client.js";
import {esc,markdown} from "./ui.js";
import {revisionDiff} from "./revision-diff.js";
let generation=0,baseline=null,timer,mode="write",lastDiff=null;
export function comparisonShell(body,editable=false){
 return '<section class="revision-comparison '+(editable?"revision-editor":"")+'"><div class="comparison-legend"><span class="diff-removed">删除／原内容</span><span class="diff-added">新增／修改内容</span><span class="small-print" id="comparison-status">正在读取上一版…</span></div><div class="comparison-columns"><section class="comparison-before"><h3 id="comparison-before-title">上一版 · 只读</h3><div id="comparison-before"></div></section><section class="comparison-after"><h3 id="comparison-after-title">修改稿</h3>'+body+'</section></div></section>';
}
export async function initComparison(s,{editable=false,content,images}={}){
 const epoch=++generation;clearTimeout(timer);baseline=null;mode=editable?"write":"preview";
 const version=editable?s.version:s.version-1;
 try{
  const base=db.remote?await db.version(s.id,version,db.session()):(s.versions||[]).find(v=>v.version===version);
  if(epoch!==generation||!document.querySelector(".revision-comparison"))return;
  if(!base)throw Error("找不到上一版。");
  baseline={...base,version};document.querySelector("#comparison-before-title").textContent="第 "+version+" 版 · 只读";
  document.querySelector("#comparison-after-title").textContent=editable?"修订稿 · 待提交":"第 "+s.version+" 版 · 修改稿";
  if(editable){document.querySelector("#comparison-before").innerHTML='<div class="revision-write-stack"><pre class="diff-overlay" aria-hidden="true" id="diff-old-overlay"></pre><textarea class="editor-body comparison-readonly" readonly aria-label="上一版原文">'+esc(base.content)+'</textarea></div><div class="prose preview-body" id="comparison-old-preview" hidden></div>';
   const area=document.querySelector('#compose [name="content"]');area.addEventListener("scroll",()=>syncOverlay(area,"diff-new-overlay"));
   const old=document.querySelector(".comparison-readonly");old.addEventListener("scroll",()=>syncOverlay(old,"diff-old-overlay"));
  }
  updateComparison(document.querySelector('#compose [name="content"]')?.value??content??s.content,images??s.images,{immediate:true});
 }catch(error){if(epoch===generation){const status=document.querySelector("#comparison-status");if(status)status.textContent="对照加载失败："+error.message;const host=document.querySelector("#comparison-before");if(host)host.innerHTML='<button type="button" class="btn" id="retry-comparison">重试读取上一版</button>';document.querySelector("#retry-comparison")?.addEventListener("click",()=>initComparison(s,{editable,content:document.querySelector('#compose [name="content"]')?.value||s.content,images}))}}
}
function syncOverlay(area,id){const pre=document.getElementById(id);if(pre){pre.scrollTop=area.scrollTop;pre.scrollLeft=area.scrollLeft}}
export function updateComparison(content,images,{immediate=false}={}){
 if(!baseline||!document.querySelector(".revision-comparison"))return;
 clearTimeout(timer);
 const render=()=>{
  if(!baseline||!document.querySelector(".revision-comparison"))return;
  lastDiff=revisionDiff(baseline.content,content);
  const status=document.querySelector("#comparison-status");if(status)status.textContent=!lastDiff.changed?"尚无正文修改":lastDiff.coarse?"改动较大，显示整体差异":"已标记文字与段落差异";
  const oldOverlay=document.querySelector("#diff-old-overlay"),newOverlay=document.querySelector("#diff-new-overlay");
  if(oldOverlay){oldOverlay.innerHTML=lastDiff.oldHtml+"\n";newOverlay.innerHTML=lastDiff.newHtml+"\n";syncOverlay(document.querySelector(".comparison-readonly"),"diff-old-overlay");syncOverlay(document.querySelector('#compose [name="content"]'),"diff-new-overlay")}
  if(mode==="preview"){
   const old=document.querySelector("#comparison-old-preview")||document.querySelector("#comparison-before");old.innerHTML=markdown(baseline.content,baseline.images,{diffRanges:lastDiff.oldRanges,diffClass:"diff-removed-block"});
   const next=document.querySelector("#preview-body")||document.querySelector("#submission-body");next.innerHTML=markdown(content,images,{diffRanges:lastDiff.newRanges,diffClass:"diff-added-block",annotatable:!!document.querySelector("#submission-body")});
   document.dispatchEvent(new Event("narv:comparison-rendered"));
  }
 };
 if(immediate)render();else timer=setTimeout(render,180);
}
export function comparisonMode(preview,content,images){
 mode=preview?"preview":"write";
 const oldStack=document.querySelector(".comparison-before .revision-write-stack"),oldPreview=document.querySelector("#comparison-old-preview");
 if(oldStack)oldStack.hidden=preview;if(oldPreview)oldPreview.hidden=!preview;
 const newOverlay=document.querySelector("#diff-new-overlay");if(newOverlay)newOverlay.hidden=preview;
 updateComparison(content,images,{immediate:true});
}
window.addEventListener("hashchange",()=>{generation++;baseline=null;clearTimeout(timer)});
document.addEventListener("narv:private-cleared",()=>{generation++;baseline=null;clearTimeout(timer)});
document.addEventListener("narv:submission-inaccessible",()=>{generation++;baseline=null;clearTimeout(timer)});
