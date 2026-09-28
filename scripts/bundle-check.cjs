const{chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict");
(async()=>{const browser=await chromium.launch({headless:true,args:["--no-proxy-server"],executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});try{
 const page=await browser.newPage(),scripts=[],errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{if(r.resourceType()==="script")scripts.push(r.url())});
 await page.goto("http://localhost:4176/#/search");await page.getByRole("heading",{name:"搜索",exact:true}).waitFor();assert(scripts.some(s=>/app-[A-Z0-9]+\.js$/.test(s)));assert(!scripts.some(s=>s.includes("katex-")));assert(scripts.length<=3);assert.equal(await page.title(),"NARV");
 await page.goto("http://localhost:4176/#/login");await page.locator('[data-account="demo-author"]').click();await page.goto("http://localhost:4176/#/submit");await page.locator('[name="content"]').fill("## 排版\n\n$E=mc^2$");await page.getByRole("button",{name:"预览",exact:true}).click();await page.locator(".katex").waitFor();assert(scripts.some(s=>s.includes("katex-")));assert.deepEqual(errors,[]);
 console.log("PASS: hashed bundled startup, <=3 initial scripts, KaTeX deferred until math preview, normal NARV title.");
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
