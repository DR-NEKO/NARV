import {reviewBlocks} from "./markdown.js";
const check=(ok,message)=>{if(!ok)throw Error(message)};
export function validateReviewAnchor(source,anchor,blocks){
 check(anchor&&typeof anchor.blockId==="string"&&anchor.blockId.length<80,"请选择原文段落。");
 const block=(blocks||reviewBlocks(source)).find(b=>b.id===anchor.blockId);check(block,"原文段落已经变化，请重新选择。");
 const start=Number(anchor.start),end=Number(anchor.end);
 check(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=block.text.length&&end-start<=1000,"请选择 1–1000 字的原文片段。");
 const split=pos=>pos>0&&pos<block.text.length&&/[\uD800-\uDBFF]/.test(block.text[pos-1])&&/[\uDC00-\uDFFF]/.test(block.text[pos]);check(!split(start)&&!split(end),"不能截断表情或 Unicode 字符。");
 const quote=block.text.slice(start,end);check(typeof anchor.quote==="string"&&quote===anchor.quote,"选中原文与当前版本不符，请重新选择。");
 return {blockId:block.id,start,end,quote,prefix:block.text.slice(Math.max(0,start-40),start),suffix:block.text.slice(end,end+40)};
}
export function editReviewAnnotation(s,u,action,data,now){
 check(s.status==="reviewing"&&s.reviewerId===u.id,"仅当前审稿人可编辑本轮批注。");
 check(Number(data.expectedVersion)===s.version&&Number(data.expectedRound)===s.round,"版本或审稿轮次已变化，请重新打开稿件。");
 s.reviewAnnotations ||= [];
 if(action==="annotation_delete"){
  const found=s.reviewAnnotations.find(a=>a.id===data.id&&a.reviewerId===u.id&&a.version===s.version&&a.round===s.round);
  check(found,"批注不存在或不属于当前审稿轮次。");s.reviewAnnotations=s.reviewAnnotations.filter(a=>a.id!==found.id);return;
 }
 check(typeof data.note==="string"&&data.note.length<=2000,"批注最多 2000 字。");
 const anchor=validateReviewAnchor(s.content,data.anchor);
 if(data.id){
  const found=s.reviewAnnotations.find(a=>a.id===data.id&&a.reviewerId===u.id&&a.version===s.version&&a.round===s.round);check(found,"批注不存在或已不属于本轮。");Object.assign(found,{anchor,note:data.note.trim(),updatedAt:now});
 }else{
  check(s.reviewAnnotations.length+(s.reviews||[]).reduce((n,r)=>n+(r.annotations||[]).length,0)<200&&s.reviewAnnotations.filter(a=>a.version===s.version&&a.round===s.round&&a.reviewerId===u.id).length<50,"每轮最多 50 条批注，每篇累计最多 200 条草稿。");
  s.reviewAnnotations.push({id:crypto.randomUUID(),version:s.version,round:s.round,reviewerId:u.id,anchor,note:data.note.trim(),createdAt:now,updatedAt:now});
 }
}

export function validateReviewAnchors(source,annotations){
 if(!annotations.length)return;
 const blocks=reviewBlocks(source);for(const a of annotations)validateReviewAnchor(source,a.anchor,blocks);
}
