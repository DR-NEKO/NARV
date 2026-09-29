import test from "node:test";
import assert from "node:assert/strict";
import {markdown,markdownHeadings,loadMath} from "../public/ui.js";
import {newManuscriptTemplate,updateTemplateFields,resumeTemplateFields} from "../public/manuscript-template.js";
const user={id:"test-user",community:{name:"社区名字",avatar:"◈",uid:"C-1234567890abcdef"},review:{name:"审稿名字",avatar:"◇",uid:"R-1234567890abcdef"}};
test("标准块解析识别相邻标题、横线、列表、引用与表格；目录不解析代码标题",()=>{
 const source="# 一级\n正文紧接标题。\n\n## **二级**\n\n### 三级\n\n---\n\n***\n\n___\n\n1. 第一项\n2. 第二项\n   - 嵌套项\n\n> 引用\n>\n> 两段话。\n\n| 项目 | 内容 |\n| --- | --- |\n| 数据 | 说明 |\n\n~~~md\n# 代码里的假标题\n---\n~~~\n\n#### 四级";
 const html=markdown(source);
 assert.match(html,/<h1 id="section-0" class="md-heading md-h1">一级<\/h1>\n<p>正文紧接标题/);
 assert.equal((html.match(/<hr>/g)||[]).length,3);assert.match(html,/<ol>/);assert.match(html,/<ul>/);assert.match(html,/<blockquote>/);assert.match(html,/<table>/);
 assert.match(html,/<code class="language-md"># 代码里的假标题\n---/);
 assert.deepEqual(markdownHeadings(source).map(h=>[h.id,h.level,h.text]),[["section-0",1,"一级"],["section-1",2,"二级"],["section-2",3,"三级"],["section-3",4,"四级"]]);
});
test("数学在列表、块和正文中渲染；代码与转义美元符号保持原文",async()=>{
 await loadMath();
 assert.match(markdown("公式 $E=mc^2$ 在正文中。\n\n- $x^2$\n- 第二项"),/class="katex"/);
 assert.match(markdown("$$\nL=\\frac{1}{n}\\sum_i x_i\n$$"),/katex-display/);
 assert.match(markdown("\\[\nx^2\n\\]"),/katex-display/);
 assert.match(markdown("\\(x^2\\)"),/class="katex"/);
 const tick=String.fromCharCode(96),literal=markdown(tick+"$x$"+tick+"\n\n~~~tex\n$$x^2$$\n---\n~~~\n\n价格 \\$5 与 \\$10。");
 assert(!literal.includes('class="katex"'));assert.match(literal,/价格 \$5 与 \$10/);assert(!literal.includes("<hr>"));
});
test("Markdown 扩展保持 HTML、链接与配图安全；独立图片用 figure，行内图片不嵌套块",()=>{
 const html=markdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[x](data:text/html;base64,WA==)\n\n![x](data:image/svg+xml;base64,WA==)\n\n[x](https://example.com/?a=1&b=2)');
 assert(!html.includes("<script>"));assert(!html.includes('href="javascript:'));assert(!html.includes('href="data:'));assert(!html.includes('src="data:image/svg'));assert.match(html,/rel="noopener noreferrer"/);
 const image="data:image/png;base64,aGVsbG8=";
 assert.match(markdown("![说明](narv-image:img-1)",{"img-1":image}),/^<figure><img/);
 assert(!markdown("文字 ![说明](narv-image:img-1)",{"img-1":image}).includes("<figure>"));
 const code=markdown("~~~md\n![说明](narv-image:img-1)\n~~~",{"img-1":image});assert(code.includes("narv-image:img-1"));assert(!code.includes(image));
});
test("投稿模板署名只带选择的身份；切换身份与标题更新，尊重手写标题",()=>{
 const draft={title:"",identity:"community",...newManuscriptTemplate(user)};
 assert(draft.content.startsWith("# 文章标题"));assert(draft.content.includes("社区名字"));assert(!draft.content.includes("审稿名字"));
 draft.identity="review";updateTemplateFields(draft,user,"identity");assert(draft.content.includes("审稿名字"));assert(!draft.content.includes("社区名字"));
 draft.title="真正的稿件标题";updateTemplateFields(draft,user,"title");assert(draft.content.startsWith("# 真正的稿件标题"));
 draft.content=draft.content.replace("# 真正的稿件标题","# 手写章节");draft.title="新稿名";updateTemplateFields(draft,user,"title");assert(draft.content.startsWith("# 手写章节"));
 const persisted={title:"服务端保存的模板",identity:"community",...newManuscriptTemplate(user)};updateTemplateFields(persisted,user,"title");delete persisted.templateTitleLine;delete persisted.templateAuthorLine;
 resumeTemplateFields(persisted,user,"社区名字");persisted.identity="review";updateTemplateFields(persisted,user,"identity");assert(!persisted.content.includes("社区名字"));assert(persisted.content.includes("审稿名字"));
 const special={...user,community:{...user.community,name:"双*星$x$"}};assert(!markdown(newManuscriptTemplate(special).content).includes('class="katex"'));
});
