import {renderMarkdown} from "./markdown.js";
export {markdownHeadings} from "./markdown.js";
let katex=null,mathLoading;
export function loadMath(){globalThis.document?.querySelector("link[data-math-style]")?.setAttribute("media","all");if(!mathLoading)mathLoading=import("./vendor/katex/katex.mjs").then(m=>{katex=m.default;renderPendingMath();return katex});return mathLoading}
function mathMarkup(s,display){try{return katex.renderToString(s,{displayMode:display,throwOnError:true,trust:false,strict:"ignore",maxExpand:500,maxSize:20,output:"htmlAndMathml"})}catch{return '<code class="math-error" title="公式语法错误或不支持的命令">'+esc(s)+'</code>'}}
function renderPendingMath(){globalThis.document?.querySelectorAll(".math-pending").forEach(e=>e.outerHTML=mathMarkup(e.dataset.latex,e.dataset.display==="true"))}
export const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const paths={bell:'<path d="M4 12V8a5 5 0 0 1 10 0v4l2 2H2zM7 16h4"/>',arrow:'<path d="M4 9h10M10 5l4 4-4 4"/>',search:'<circle cx="8" cy="8" r="5"/><path d="m12 12 4 4"/>',pen:'<path d="m11 3 4 4M3 15l1-5L12 2a2 2 0 0 1 3 3l-8 8z"/>',book:'<path d="M2 3h4a3 3 0 0 1 3 2v11a3 3 0 0 0-3-2H2zM9 5a3 3 0 0 1 3-2h4v11h-4a3 3 0 0 0-3 2"/>',file:'<path d="M4 2h7l4 4v10H4zM11 2v5h4M7 10h5M7 13h4"/>',check:'<path d="m4 9 3 3 7-7"/>',user:'<circle cx="9" cy="6" r="3"/><path d="M3 16v-2a6 6 0 0 1 12 0v2"/>',github:'<path d="M6 16v-3c-3 0-4-2-4-5 0-1 .5-2 1-3L3 2l4 1h4l4-1v3c1 1 1 2 1 3 0 3-1 5-4 5v3M6 14c-3 1-4-1-5-2"/>',logout:'<path d="M7 3H3v12h4M7 9h9M12 5l4 4-4 4"/>',chevron:'<path d="m7 4 5 5-5 5"/>',image:'<rect x="2" y="2" width="14" height="14" rx="2"/><circle cx="6" cy="6" r="1"/><path d="m3 14 4-5 3 3 2-2 4 4"/>',star:'<path d="m9 2 2 5 5 .5-4 3.5 1 5-4-2.5L5 16l1-5-4-3.5L7 7z"/>'};
export const icon=n=>'<svg class="icon" viewBox="0 0 18 18" aria-hidden="true">'+(paths[n]||paths.file)+'</svg>';
export const empty=(title,text)=>'<div class="empty">'+icon("file")+'<h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></div>';
export function markdown(source,images={}){return renderMarkdown(source,images,{renderMath:(s,display)=>{
 if(katex)return mathMarkup(s,display);
 loadMath().catch(()=>{});
 return '<span class="math-pending" data-latex="'+esc(s)+'" data-display="'+display+'"><code>'+esc(s)+'</code></span>';
}})}

export function highlight(text,terms=[]){const ordered=[...new Set(terms.filter(Boolean))].sort((a,b)=>b.length-a.length);if(!ordered.length)return esc(text);const pattern=ordered.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return String(text).split(new RegExp("("+pattern+")","giu")).map((s,i)=>i%2?"<mark>"+esc(s)+"</mark>":esc(s)).join("")}catch{return esc(text)}}
export function toast(text){const e=document.querySelector("#toast");if(!e)return;e.textContent=text;e.classList.add("toast-visible");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>e.classList.remove("toast-visible"),4500)}
export function download(name,content,type="application/json"){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
export const when=s=>new Date(s).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
export const field=(label,name,value="",attrs="")=>'<label class="form-field"><span>'+label+'</span><input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
export const area=(label,name,value="",attrs="")=>'<label class="form-field"><span>'+label+'</span><textarea name="'+name+'" rows="4" '+attrs+'>'+esc(value)+'</textarea></label>';
export const heading=(title,desc="",action="")=>'<div class="page-heading"><div><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></div>'+action+'</div>';
