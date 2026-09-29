import {diffLines,diffChars} from "./vendor/diff/index.mjs";
const escape=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const lines=s=>s.match(/[^\n]*\n|[^\n]+$/g)||[];
export function revisionDiff(before,after){
 before=String(before||"").replace(/\r\n/g,"\n");after=String(after||"").replace(/\r\n/g,"\n");
 const chunks=diffLines(before,after,{timeout:20,maxEditLength:2000});
 const parts=chunks||[{removed:true,value:before},{added:true,value:after}];
 let oldHtml="",newHtml="",oldLine=0,newLine=0;const oldRanges=[],newRanges=[],deadline=Date.now()+35;
 for(let i=0;i<parts.length;i++){
  const p=parts[i],count=lines(p.value).length;
  if(!p.added&&!p.removed){oldHtml+=escape(p.value);newHtml+=escape(p.value);oldLine+=count;newLine+=count;continue}
  const range=p.removed?oldRanges:newRanges,start=p.removed?oldLine:newLine;range.push([start,start+count]);
  let html='<mark class="'+(p.removed?"diff-removed":"diff-added")+'">'+escape(p.value)+'</mark>';
  if(p.removed&&parts[i+1]?.added&&p.value.length+parts[i+1].value.length<12000&&Date.now()<deadline){
   const next=parts[i+1],chars=diffChars(p.value,next.value,{timeout:Math.max(1,Math.min(8,deadline-Date.now())),maxEditLength:1000});
   if(chars){oldHtml+=chars.filter(c=>!c.added).map(c=>c.removed?'<mark class="diff-removed">'+escape(c.value)+'</mark>':escape(c.value)).join("");
    newHtml+=chars.filter(c=>!c.removed).map(c=>c.added?'<mark class="diff-added">'+escape(c.value)+'</mark>':escape(c.value)).join("");
    newRanges.push([newLine,newLine+lines(next.value).length]);oldLine+=count;newLine+=lines(next.value).length;i++;continue}
  }
  if(p.removed){oldHtml+=html;oldLine+=count}else{newHtml+=html;newLine+=count}
 }
 return {oldHtml,newHtml,oldRanges,newRanges,coarse:!chunks,changed:before!==after};
}
