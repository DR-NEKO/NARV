import MarkdownIt from "./vendor/markdown-it/index.mjs";
import {validImageSource} from "./images.js";
const md=new MarkdownIt({html:false,breaks:true,linkify:false,typographer:false,maxNesting:32});
const escape=md.utils.escapeHtml;
function findClose(src,close,start){
 for(let pos=src.indexOf(close,start);pos>=0;pos=src.indexOf(close,pos+close.length)){
  let slashes=0;for(let i=pos-1;i>=0&&src[i]==="\\";i--)slashes++;
  if(slashes%2===0)return pos;
 }
 return -1;
}
function mathInline(state,silent){
 const start=state.pos,src=state.src;
 let open,close,display=false;
 if(src.startsWith("\\(",start)){open="\\(";close="\\)"}
 else if(src.startsWith("\\[",start)){open="\\[";close="\\]";display=true}
 else if(src.startsWith("$$",start)){open=close="$$";display=true}
 else if(src[start]==="$"){open=close="$";if(/\s/.test(src[start+1]||" "))return false}
 else return false;
 const end=findClose(src,close,start+open.length);
 if(end<0||end===start+open.length)return false;
 const content=src.slice(start+open.length,end);
 if(!display&&(/\n/.test(content)||/\s/.test(src[end-1])||/\d/.test(src[end+1]||"")))return false;
 if(!silent){const token=state.push("narv_math_inline","",0);token.content=content;token.meta={display}}
 state.pos=end+close.length;return true;
}
md.inline.ruler.before("escape","narv_math",mathInline);
function mathBlock(state,startLine,endLine,silent){
 if(state.sCount[startLine]-state.blkIndent>=4)return false;
 const start=state.bMarks[startLine]+state.tShift[startLine],first=state.src.slice(start,state.eMarks[startLine]).trim();
 const open=first.startsWith("$$")?"$$":first.startsWith("\\[")?"\\[":null;if(!open)return false;
 const close=open==="$$"?"$$":"\\]",same=findClose(first,close,open.length);
 let content,line=startLine;
 if(same>=0){if(first.slice(same+close.length).trim())return false;content=first.slice(open.length,same)}
 else{
  const lines=[first.slice(open.length)];
  for(line=startLine+1;line<endLine;line++){
   if(state.sCount[line]<state.blkIndent&&state.src.slice(state.bMarks[line],state.eMarks[line]).trim())return false;
   const value=state.src.slice(state.bMarks[line]+state.tShift[line],state.eMarks[line]),end=findClose(value,close,0);
   if(end>=0&&!value.slice(end+close.length).trim()){lines.push(value.slice(0,end));break}
   lines.push(value);
  }
  if(line>=endLine)return false;
  content=lines.join("\n");
 }
 if(silent)return true;
 const token=state.push("narv_math_block","div",0);token.block=true;token.content=content.trim();token.map=[startLine,line+1];state.line=line+1;return true;
}
md.block.ruler.before("fence","narv_math",mathBlock,{alt:["paragraph","reference","blockquote","list"]});
md.renderer.rules.narv_math_inline=(tokens,i,options,env)=>env.renderMath?.(tokens[i].content,tokens[i].meta.display)||escape(tokens[i].content);
md.renderer.rules.narv_math_block=(tokens,i,options,env)=>'<div class="math-block">'+(env.renderMath?.(tokens[i].content,true)||escape(tokens[i].content))+'</div>\n';
const linkOpen=md.renderer.rules.link_open||((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
md.renderer.rules.link_open=(tokens,i,options,env,self)=>{tokens[i].attrSet("target","_blank");tokens[i].attrSet("rel","noopener noreferrer");return linkOpen(tokens,i,options,env,self)};
const imageAllowed=src=>validImageSource(src)||/^https:\/\/[^\s<>"']+$/i.test(src);
const imageSource=(src,env)=>/^narv-image:img-\d+$/.test(src)?env.images?.[src.slice(11)]||"":src;
md.renderer.rules.image=(tokens,i,options,env,self)=>{
 const image=tokens[i],original=image.attrGet("src")||"",src=imageSource(original,env),caption=self.renderInlineAsText(image.children||[],options,env);
 if(/^narv-image:img-\d+$/.test(original)&&!validImageSource(src))return escape("[图片附件缺失："+(caption||original.slice(11))+"]");
 if(!imageAllowed(src))return escape("[图片地址不受支持："+caption+"]");
 return '<img src="'+escape(src)+'" alt="'+escape(caption)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"'+(env.annotatable&&!image.meta?.figure?' class="review-atom" data-review-text="'+escape(caption)+'"':"")+'>'+(image.meta?.figure&&caption?'<figcaption>'+escape(caption)+'</figcaption>':"");
};
md.renderer.rules.table_open=()=>'<div class="markdown-table" role="region" aria-label="数据表格" tabindex="0"><table>\n';
md.renderer.rules.table_close=()=>'</table></div>\n';
function inlineText(children=[]){return children.map(t=>{
 if(["text","code_inline","narv_math_inline"].includes(t.type))return t.content;
 if(["softbreak","hardbreak"].includes(t.type))return "\n";
 if(t.type==="image")return inlineText(t.children);
 return "";
}).join("")}
function collectBlocks(tokens){
 const result=[];let tableMap=null,cell=0;
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t.type==="table_open"){tableMap=t.map;cell=0}
  if(t.type==="table_close")tableMap=null;
  if(tableMap&&["th_open","td_open"].includes(t.type)&&tokens[i+1]?.type==="inline"){
   const text=inlineText(tokens[i+1].children),id="t"+tableMap[0]+"-"+cell++;if(text.trim())result.push({id,text,index:i,map:tableMap});continue;
  }
  if(!t.map)continue;
  if(["paragraph_open","heading_open"].includes(t.type)&&tokens[i+1]?.type==="inline"){
   const text=inlineText(tokens[i+1].children);
   if(text.trim())result.push({id:"b"+t.map[0]+"-"+t.map[1],text,index:i,map:t.map});
  }else if(["fence","code_block","narv_math_block"].includes(t.type)&&t.content.trim())result.push({id:"b"+t.map[0]+"-"+t.map[1],text:t.content,index:i,map:t.map});
 }
 return result;
}
const fenceRender=md.renderer.rules.fence,codeRender=md.renderer.rules.code_block;
const attrs=token=>token.meta?.reviewBlock?' data-review-block="'+escape(token.meta.reviewBlock)+'"':"";
md.renderer.rules.fence=(tokens,i,options,env,self)=>{const html=fenceRender(tokens,i,options,env,self);return attrs(tokens[i])?'<div'+attrs(tokens[i])+'>'+html+'</div>':html};
md.renderer.rules.code_block=(tokens,i,options,env,self)=>{const html=codeRender(tokens,i,options,env,self);return attrs(tokens[i])?'<div'+attrs(tokens[i])+'>'+html+'</div>':html};
const mathBlockRender=md.renderer.rules.narv_math_block;
md.renderer.rules.narv_math_block=(tokens,i,options,env,self)=>{const html=mathBlockRender(tokens,i,options,env,self);return attrs(tokens[i])?'<div'+attrs(tokens[i])+'>'+html+'</div>':html};
md.core.ruler.push("narv_structure",state=>{
 let index=0;
 for(let i=0;i<state.tokens.length;i++){
  const t=state.tokens[i];
  if(t.type==="heading_open"){t.attrSet("id","section-"+index++);t.attrSet("class","md-heading md-h"+t.tag.slice(1))}
  if(t.type==="paragraph_open"&&state.tokens[i+1]?.type==="inline"){
   const children=state.tokens[i+1].children;
   if(children?.length===1&&children[0].type==="image"&&imageAllowed(imageSource(children[0].attrGet("src")||"",state.env))){
    t.tag="figure";state.tokens[i+2].tag="figure";children[0].meta={figure:true};
   }
  }
 }
 if(state.env.annotatable)for(const block of collectBlocks(state.tokens)){
  const t=state.tokens[block.index];
  if(["paragraph_open","heading_open","th_open","td_open"].includes(t.type)){t.attrSet("data-review-block",block.id);if(t.hidden){t.hidden=false;state.tokens[block.index+2].hidden=false}}
  else t.meta={...t.meta,reviewBlock:block.id};
 }
});
export function renderMarkdown(source,images={},env={}){return md.render(String(source||""),{...env,images})}
export function markdownHeadings(source){
 const tokens=md.parse(String(source||""),{}),entries=[];
 for(let i=0;i<tokens.length;i++)if(tokens[i].type==="heading_open")entries.push({id:tokens[i].attrGet("id"),level:Number(tokens[i].tag.slice(1)),text:inlineText(tokens[i+1].children)});
 return entries;
}
export function reviewBlocks(source){return collectBlocks(md.parse(String(source||""),{})).map(({index,...b})=>b)}
