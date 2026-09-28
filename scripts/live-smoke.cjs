const {chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:"http://127.0.0.1:7980"},executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 const base="https://dr-neko.github.io/NARV/";
 const response=await page.goto(base,{waitUntil:"domcontentloaded",timeout:60000});assert.equal(response.status(),200);
 await page.getByRole("heading",{name:"文章"}).waitFor({timeout:45000});
 assert.equal(await page.locator(".demo-strip").count(),0);
 const config=await page.evaluate(async()=>{const {config}=await import("./config.js");return config});
 assert.equal(config.mode,"remote");assert.equal(config.apiBase,"https://narv-api.dr-neko-narv.workers.dev");
 await page.evaluate(()=>document.fonts.ready);
 const dir=path.join(__dirname,"../artifacts");fs.mkdirSync(dir,{recursive:true});
 await page.screenshot({path:path.join(dir,"live-home-desktop.png"),fullPage:true});
 await page.goto(base+"#/login",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"使用 GitHub 登录",exact:true}).waitFor();assert.equal(await page.locator("[data-account]").count(),0);
 await page.goto(base+"#/about",{waitUntil:"domcontentloaded"});await page.getByRole("heading",{name:"关于 NARV"}).waitFor();assert(!(await page.locator("main").innerText()).includes("真实登录、远程存储和定时服务尚未接通"));
 await page.setViewportSize({width:390,height:844});await page.goto(base,{waitUntil:"domcontentloaded"});await page.getByRole("heading",{name:"文章"}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(dir,"live-home-mobile.png"),fullPage:true});
 assert.deepEqual(errors,[]);console.log("PASS: live GitHub Pages HTTP 200, remote API config, successful cross-origin bootstrap, no demo roles, login entry, about page, fonts and mobile layout.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
