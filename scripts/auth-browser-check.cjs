const {chromium}=require("C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{spawn}=require("node:child_process"),{pathToFileURL}=require("node:url");
const mod=p=>import(pathToFileURL(path.join(__dirname,p)).href);
(async()=>{
 const [{sqlite},{load,save},{initialUsers},{withIdentities},{hash,newSession},{command}]=await Promise.all([mod("sqlite-adapter.mjs"),mod("../backend/repository.js"),mod("../public/roles.js"),mod("../public/identity.js"),mod("../backend/auth.js"),mod("../backend/service.js")]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"narv-auth-test-")),file=path.join(dir,"narv.sqlite"),DB=sqlite(file),env={DB};
 const b=await load(DB),st=structuredClone(b.state);st.users=initialUsers.map(withIdentities);await save(DB,b,st);
 const verifier="v".repeat(43),ticket="t".repeat(43),challenge=await hash(verifier);
 await DB.prepare("INSERT INTO auth(key,kind,data,expires) VALUES(?,'ticket',?,?)").bind(await hash(ticket),JSON.stringify({userId:"demo-author",challenge}),Date.now()+600000).run();
 const oe=await newSession(env,"demo-original");DB.close();
 const server=spawn(process.execPath,[path.join(__dirname,"serve-backend.mjs")],{env:{...process.env,NARV_API_PORT:"4179",NARV_DATA_DIR:dir},windowsHide:true,stdio:["ignore","pipe","pipe"]});let logs="",browser;
 server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs||"Startup timeout")),10000);server.stdout.on("data",()=>{if(logs.includes("database-backed preview")){clearTimeout(timer);resolve()}})});
 browser=await chromium.launch({headless:true,args:["--no-proxy-server"],executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://localhost:4179/#/login");await page.locator("main h1").waitFor();
 await page.evaluate(({v,c})=>{sessionStorage.setItem("narv-login-verifier:"+c,v);sessionStorage.setItem("narv-next","workspace")},{v:verifier,c:challenge});
 let calls=0,meCalls=0;page.on("request",r=>{if(r.url().endsWith("/api/me"))meCalls++});
 await page.route("**/auth/exchange",async r=>{const response=await r.fetch();if(++calls===1){await r.abort();return}await new Promise(resolve=>setTimeout(resolve,300));await r.fulfill({response})});
 let workspaceDone=false;await page.route("**/api/workspace?tab=&*",async r=>{const response=await r.fetch();await new Promise(resolve=>setTimeout(resolve,1500));workspaceDone=true;await r.fulfill({response})});
 await page.goto("http://localhost:4179/#/auth-complete?ticket="+ticket+"&attempt="+challenge);
 await page.getByRole("heading",{name:"正在完成登录"}).waitFor();await page.locator(".workspace-tabs").waitFor();
 assert.equal(calls,2);assert.equal(meCalls,0,"exchange ACK supplies profile without another blocking /me");assert.equal(workspaceDone,false,"show account before queue loads");
 assert(!page.url().includes("ticket="));assert.equal(await page.evaluate(c=>sessionStorage.getItem("narv-login-verifier:"+c),challenge),null);
 await page.locator('.workspace-content[aria-busy="false"]').waitFor();await page.unroute("**/api/workspace?tab=&*");
 assert.equal(await page.evaluate(()=>sessionStorage.getItem("narv-api-session")),null);assert(await page.evaluate(()=>localStorage.getItem("narv-api-session")));
 const second=await context.newPage();await second.goto("http://localhost:4179/#/workspace/profile");await second.locator(".persona-card").first().waitFor();assert.equal(await second.getByRole("button",{name:"使用 GitHub 登录",exact:true}).count(),0);
 await page.getByRole("button",{name:"退出",exact:true}).click();await second.getByRole("button",{name:"使用 GitHub 登录",exact:true}).waitFor();assert.equal(await second.evaluate(()=>localStorage.getItem("narv-api-session")),null);await second.reload();await second.getByRole("button",{name:"使用 GitHub 登录",exact:true}).waitFor();
 // A remembered login survives a fresh browser context with no sessionStorage.
 await page.evaluate(t=>localStorage.setItem("narv-api-session",t),oe);await page.goto("http://localhost:4179/#/workspace/members");await page.getByRole("link",{name:"青砚",exact:true}).waitFor();
 const saved=await context.storageState(),fresh=await browser.newContext({storageState:saved}),newPage=await fresh.newPage();await newPage.goto("http://localhost:4179/#/workspace");await newPage.locator(".workspace-tabs").waitFor();await fresh.close();
 const liveDB=sqlite(file),before=await load(liveDB),temp=before.state.users.find(u=>u.id==="demo-temp"),uid=temp.review.uid;
 await command({DB:liveDB},"demo-temp",{name:"updateProfiles",args:[{community:{name:"社区新昵称",avatar:temp.community.avatar},review:{name:"审稿新昵称",avatar:temp.review.avatar}}],revision:before.revision});
 liveDB.close();
 await page.getByRole("link",{name:"双身份设置",exact:true}).click();await page.locator(".persona-card").first().waitFor();await page.getByRole("link",{name:"账号与权限",exact:true}).click();
 await page.getByRole("link",{name:"审稿新昵称",exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"青砚",exact:true}).count(),0);assert(await page.locator(".member").filter({hasText:"审稿新昵称"}).innerText().then(t=>t.includes(uid)));
 await page.getByRole("link",{name:"审稿新昵称",exact:true}).click();await page.getByRole("heading",{name:"审稿新昵称",exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log("PASS: lost exchange response retried once, single session, immediate account ACK, new-tab/browser persistence, cross-tab logout, fresh UID-bound names and member detail.");
 }catch(error){console.error(logs);if(browser)for(const c of browser.contexts())for(const p of c.pages())console.error(await p.locator("body").innerText());throw error}
 finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exit(1)});
