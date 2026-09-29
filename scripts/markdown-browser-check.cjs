const {chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{spawn}=require("node:child_process"),{pathToFileURL}=require("node:url");
const mod=p=>import(pathToFileURL(path.join(__dirname,p)).href);
(async()=>{
 const [{sqlite},{load,save},{initialUsers},{withIdentities},{newSession},{command}]=await Promise.all([mod("sqlite-adapter.mjs"),mod("../backend/repository.js"),mod("../public/roles.js"),mod("../public/identity.js"),mod("../backend/auth.js"),mod("../backend/service.js")]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"narv-markdown-")),file=path.join(dir,"narv.sqlite"),DB=sqlite(file),env={DB};
 const before=await load(DB),st=structuredClone(before.state);st.users=initialUsers.map(withIdentities);await save(DB,before,st);
 const run=(u,name,args)=>command(env,u,{name,args}),body=[
 "# 一级标题：从问题到结论","这一段紧接标题，检查 Markdown 块边界和正文间距。","",
 "## 二级标题：背景与方法","","标题采用主题橙色，浅色横线只用于区分章节，让阅读的层次更清楚。","",
 "### 三级标题：一个具体观察","","第一行左侧有短竖线。正文保留清晰、安静的阅读字体，不把整篇文章染成橙色。","",
 "---","","> 判断应该交代证据、适用条件与局限。","",
 "1. 先定义问题","2. 再比较证据","   - 区分事实与推测","   - 记录失败的尝试","",
 "| 项目 | 说明 | 边界 |","| --- | --- | --- |","| 方法 | 采用明确步骤 | 适用于给定样本 |","| 结果 | 解释观察 | 不外推个别经验 |","",
 "## 二级标题：公式与记录","","行内公式 $E=mc^2$，独立公式：","","$$","L=\\frac{1}{n}\\sum_i(y_i-\\hat y_i)^2","$$","",
 "~~~md","# 代码里的文字不是目录标题","---","~~~","",
 "#### 四级标题：后续方向","","把新的证据与原有判断放在同一套条件下比较。"
 ].join("\n");
 const d={title:"Markdown 排版验收",category:"科研与实践",summary:"验证共享的文章、审稿和投稿预览排版。",content:body,consents:{original:true,privacy:true,policy:true,responsibility:true}};
 const article=(await run("demo-author","create",[d])).result;
 await run("demo-author","action",[article.id,"submit",d]);await run("demo-temp","action",[article.id,"claim"]);await run("demo-temp","action",[article.id,"review",{expectedVersion:1,decision:"accept",note:"排版测试的内容具有充分的说明，允许公开。",conflictFree:true}]);await run("demo-author","action",[article.id,"publish",{publishConsent:true}]);
 const withdrawn=(await run("demo-author","create",[{...d,title:"认领后尚无意见的撤回稿"}])).result;await run("demo-author","action",[withdrawn.id,"submit",d]);await run("demo-temp","action",[withdrawn.id,"claim"]);await run("demo-author","action",[withdrawn.id,"withdraw"]);
 const token=await newSession(env,"demo-author");DB.close();
 const server=spawn(process.execPath,[path.join(__dirname,"serve-backend.mjs")],{env:{...process.env,NARV_API_PORT:"4180",NARV_DATA_DIR:dir},windowsHide:true,stdio:["ignore","pipe","pipe"]});let logs="",browser;server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs||"Startup timeout")),10000);server.stdout.on("data",()=>{if(logs.includes("database-backed preview")){clearTimeout(timer);resolve()}})});
 browser=await chromium.launch({headless:true,args:["--no-proxy-server"],executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
 const go=async p=>{await page.goto("http://localhost:4180/#/"+p);await page.locator("main").waitFor()};
 await go("article/"+article.id);await page.locator(".article-header").waitFor();await page.locator(".katex-display").waitFor();
 const prose=page.locator(".reading-layout article>.prose");
 assert.equal(await prose.locator("hr").count(),1);assert.equal(await prose.locator(".md-h1").count(),1);assert.equal(await prose.locator(".md-h2").count(),2);
 assert.equal(await page.locator('.toc a[data-scroll^="section-"]').count(),5);assert(!await page.locator(".toc").innerText().then(t=>t.includes("代码里的文字")));
 const style=await prose.locator(".md-h1").evaluate(e=>{const s=getComputedStyle(e),h2=getComputedStyle(e.parentElement.querySelector("h2")),h3=e.parentElement.querySelector("h3"),bar=getComputedStyle(h3,"::before");return {h1:s.borderBottomWidth,h2:h2.borderBottomWidth,deep:s.borderBottomColor,soft:h2.borderBottomColor,text:s.color,barWidth:bar.width,barHeight:parseFloat(bar.height),lineHeight:parseFloat(getComputedStyle(h3).lineHeight)}});
 assert.equal(style.h1,"2px");assert.equal(style.h2,"1px");assert.notEqual(style.deep,style.soft);assert.equal(style.barWidth,"3px");assert(style.barHeight<style.lineHeight);
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(__dirname,"../artifacts/markdown-article-desktop.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,"../artifacts/markdown-article-mobile.png"),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(t=>sessionStorage.setItem("narv-api-session",t),token);
 await go("submit");await page.locator("#compose").waitFor();assert((await page.locator('[name="content"]').inputValue()).startsWith("# 文章标题"));
 await page.locator('[name="title"]').fill("模板恢复验收");await page.locator('[name="identity"]').selectOption("review");assert((await page.locator('[name="content"]').inputValue()).includes("**作者：** 山止"));assert(!(await page.locator('[name="content"]').inputValue()).includes("林序"));await page.locator("#compose-author").filter({hasText:"山止"}).waitFor();
 await page.getByRole("button",{name:"预览",exact:true}).click();await page.locator("#preview-body .md-h1").filter({hasText:"模板恢复验收"}).waitFor();assert.equal(await page.locator("#preview-body hr").count(),1);await page.screenshot({path:path.join(__dirname,"../artifacts/markdown-template-desktop.png"),fullPage:true});
 await page.getByRole("button",{name:"写作",exact:true}).click();const content=await page.locator('[name="content"]').inputValue();await page.reload();await page.locator("#compose").waitFor();assert.equal(await page.locator('[name="content"]').inputValue(),content);
 await page.getByRole("button",{name:"暂存草稿",exact:true}).click();await page.locator(".status.draft").waitFor();await page.getByRole("link",{name:"继续写作",exact:true}).click();await page.locator("#compose").waitFor();await page.locator('[name="identity"]').selectOption("community");assert((await page.locator('[name="content"]').inputValue()).includes("林序"));assert(!(await page.locator('[name="content"]').inputValue()).includes("山止"));
 const manual="# 我自己写的正文\n\n保留作者手工编辑的内容与标题。";await page.locator('[name="content"]').fill(manual);await page.reload();await page.locator("#compose").waitFor();assert.equal(await page.locator('[name="content"]').inputValue(),manual);
 await go("submission/"+withdrawn.id);await page.getByRole("button",{name:"删除稿件",exact:true}).waitFor();page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"删除稿件",exact:true}).click();await page.locator("#toast").filter({hasText:"稿件已删除"}).waitFor();await page.reload();await page.locator(".workspace-tabs").waitFor();assert.equal(await page.locator('a[href="#/submission/'+withdrawn.id+'"]').count(),0);
 await go("submission/"+article.id);await page.locator(".status.published").waitFor();assert.equal(await page.locator('[data-transition="delete_draft"]').count(),0);
 const verify=sqlite(file);assert.equal((await verify.prepare("SELECT count(*) AS n FROM entities WHERE key=?").bind("submissions/"+withdrawn.id).first()).n,0);verify.close();
 assert.deepEqual(errors,[]);console.log("PASS: actual article and preview typography, heading lines/short bar, Markdown tables/lists/math/code and TOC, phone layout, prefilled identity-safe template, local/server draft restoration, unreviewed withdrawn deletion, published deletion denied.");
 }catch(error){console.error(logs);if(browser)for(const c of browser.contexts())for(const p of c.pages()){console.error(await p.locator("body").innerText());await p.screenshot({path:path.join(__dirname,"../artifacts/markdown-failure.png"),fullPage:true})}throw error}
 finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exit(1)});
