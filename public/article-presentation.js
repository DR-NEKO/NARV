import {articleReadingSource,markdownHeadings} from "./markdown.js";
import {esc} from "./ui.js";
export const readingSource=a=>articleReadingSource(a.content,a.title,a.author);
export function tocTree(entries){
 const roots=[],stack=[];
 for(const entry of entries){const node={...entry,children:[]};while(stack.length&&stack.at(-1).level>=entry.level)stack.pop();(stack.length?stack.at(-1).children:roots).push(node);stack.push(node)}
 return roots;
}
export function articleToc(source){
 const nodes=tocTree(markdownHeadings(source));
 const render=(rows,depth=0)=>rows.map(n=>'<div class="toc-node toc-depth-'+Math.min(depth,3)+'">'+(n.children.length?'<details><summary><a href="#'+n.id+'" data-scroll="'+n.id+'">'+esc(n.text)+'</a><span class="toc-arrow" aria-hidden="true">›</span></summary><div class="toc-children">'+render(n.children,depth+1)+'</div></details>':'<a href="#'+n.id+'" data-scroll="'+n.id+'">'+esc(n.text)+'</a>')+'</div>').join("");
 return '<h2>本文目录</h2><nav aria-label="本文目录">'+render(nodes)+'<div class="toc-node toc-discussion"><a href="#comments" data-scroll="comments">补充与回应</a></div></nav>';
}
