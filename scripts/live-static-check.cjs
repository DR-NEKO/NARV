const {chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:"http://127.0.0.1:7980"},executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],dynamic=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{if(r.url().includes("narv-api."))dynamic.push(new URL(r.url()).pathname)});
  await page.goto("https://dr-neko.github.io/NARV/",{waitUntil:"domcontentloaded",timeout:60000});await page.getByRole("heading",{name:"文章"}).waitFor({timeout:45000});
  const manifest=await page.evaluate(async()=>{const r=await fetch("./content/catalog.json");if(!r.ok)throw Error("Missing static manifest");return r.json()});assert.equal(manifest.version,1);
  await page.getByRole("link",{name:"搜索",exact:true}).click();await page.getByRole("heading",{name:"搜索"}).waitFor();await page.locator('[name="q"]').fill("研究");await page.getByRole("button",{name:"搜索",exact:true}).click();
  await page.getByRole("link",{name:"关于",exact:true}).click();await page.getByRole("heading",{name:"关于 NARV"}).waitFor();
  await page.getByRole("link",{name:"登录",exact:true}).click();await page.getByRole("button",{name:"使用 GitHub 登录",exact:true}).waitFor();assert.equal(await page.locator("[data-account]").count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(dynamic,[]);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log("PASS: live Pages static manifest, anonymous home/search/about/login navigation uses ZERO Worker requests, no demo roles, mobile layout.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
