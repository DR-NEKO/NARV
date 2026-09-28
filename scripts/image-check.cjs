const {chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-proxy-server"],executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://localhost:4173/#/submit");
 await page.locator('[data-account="demo-author"]').click();
 await page.locator("#compose").waitFor();
 const body="## 图片编辑体验\n\n这里保留正常的写作内容，粘贴截图以后不会再被成千上万的字符打断。图片说明可以直接修改，图片与投稿版本一同保存。\n\n行内公式 $E=mc^2$。";
 await page.locator('[name="title"]').fill("图片与文字之间，留出写作的空间");
 await page.locator('[name="summary"]').fill("测试图片短引用在草稿、审稿与公开阅读中的完整流转。");
 await page.locator('[name="content"]').fill(body);
 const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=640;c.height=240;const x=c.getContext("2d");x.fillStyle="#ca863e";x.fillRect(0,0,640,240);x.fillStyle="#fff";x.font="32px serif";x.fillText("NARV / A note worth keeping",50,130);return c.toDataURL()});
 const insert=async type=>page.evaluate(async({png,type})=>{
   const blob=await (await fetch(png)).blob(),dt=new DataTransfer();
   dt.items.add(new File([blob],"figure.png",{type:"image/png"}));
   const target=document.querySelector(type==="paste"?'[name="content"]':"#image-drop");
   target.dispatchEvent(type==="paste"?new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true}):new DragEvent("drop",{dataTransfer:dt,bubbles:true,cancelable:true}));
 },{png,type});
 await insert("paste");await page.locator(".image-chip img").waitFor();
 const short=await page.locator('[name="content"]').inputValue();
 assert(!short.includes("base64"));assert(short.length<body.length+100);assert(short.includes("narv-image:img-1"));
 await insert("drop");await page.waitForFunction(()=>document.querySelectorAll(".image-chip img").length===2);
 await page.locator('[name="content"]').fill((await page.locator('[name="content"]').inputValue()).replace("请填写图片说明","一张实验记录"));
 await page.getByRole("button",{name:"预览",exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll("#preview-body img")].length===2&&[...document.querySelectorAll("#preview-body img")].every(x=>x.complete&&x.naturalWidth>0));
 await page.locator("#preview-body .katex").waitFor();
 await page.getByRole("button",{name:"移除图片 2",exact:true}).click();
 assert.equal(await page.locator("#preview-body img").count(),1);
 await page.getByRole("button",{name:"写作",exact:true}).click();
 // Reload triggers the normal beforeunload draft flush.
 await page.reload();await page.locator("#compose").waitFor();await page.locator(".image-chip img").waitFor();
 assert(!(await page.locator('[name="content"]').inputValue()).includes("base64"));
 await page.evaluate(()=>document.fonts.ready);
 const dir=path.join(__dirname,"../artifacts");fs.mkdirSync(dir,{recursive:true});
 await page.screenshot({path:path.join(dir,"image-editor-short-reference.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:1050});
 // Saving and reopening a stored draft must retain the attachment.
 await page.getByRole("button",{name:"暂存草稿",exact:true}).click();
 await page.locator(".detail-grid .prose img").waitFor();
 await page.getByRole("link",{name:"继续写作",exact:true}).click();
 await page.locator(".image-chip img").waitFor();
 for(const n of ["responsibility","original","privacy","policy"])await page.locator('[name="'+n+'"]').check();
 await page.getByRole("button",{name:/提交审阅/}).click();
 await page.locator(".status.submitted").waitFor();
 const id=page.url().split("/").at(-1);
 const exported=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"导出稿件",exact:true}).click()]);
 const output=fs.readFileSync(await exported[0].path(),"utf8");assert(output.includes("data:image/jpeg;base64,"));assert(!output.includes("narv-image:"));
 // Only the acceptance/publication transitions are driven by the existing store API here.
 await page.evaluate(async id=>{const db=await import("/store.js"),reviewer=db.account("demo-temp"),author=db.session();let s=db.action(id,"claim",reviewer);db.action(id,"review",reviewer,{expectedVersion:s.version,decision:"accept",note:"配图与正文说明清楚，符合发表要求。",conflictFree:true});db.action(id,"publish",author,{publishConsent:true});},id);
 await page.goto("http://localhost:4173/#/article/"+id);
 await page.waitForFunction(()=>{const img=document.querySelector("article .prose img");return img?.complete&&img.naturalWidth>0});
 assert(!(await page.locator("article").innerText()).includes("narv-image:"));
 // Existing local drafts with embedded data migrate upon opening, without deleting source.
 await page.evaluate(async png=>{const db=await import("/store.js");localStorage.setItem(db.draftKey(db.session(),null),JSON.stringify({title:"旧草稿",category:"学习与课程",summary:"旧稿件仍可以恢复原始配图。",content:"旧稿件\n\n![旧图片]("+png+")",expectedVersion:0,identity:"community",contactEmail:""}));},png);
 await page.goto("http://localhost:4173/#/submit");await page.locator(".image-chip img").waitFor();
 assert.equal(await page.locator('[name="content"]').inputValue(),"旧稿件\n\n![旧图片](narv-image:img-1)");
 assert.deepEqual(errors,[]);
 console.log("PASS: clipboard + drop, compact editor, caption, preview/removal, reload, stored draft, submission, standalone export, publication, legacy draft migration, mobile overflow.");
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
