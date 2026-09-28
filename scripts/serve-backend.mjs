import http from "node:http";
import os from "node:os";
import {readFile,stat,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import worker from "../backend/worker.js";
import {sqlite} from "./sqlite-adapter.mjs";
import {scheduled} from "../backend/service.js";
const root=fileURLToPath(new URL("../",import.meta.url)),local=process.env.NARV_DATA_DIR||(process.platform==="win32"?path.join(os.tmpdir(),"narv-local-api"):path.join(root,".local"));await mkdir(local,{recursive:true});
const port=Number(process.env.NARV_API_PORT||4174),origin="http://localhost:"+port;
const env={IDENTITY_PEPPER:process.env.IDENTITY_PEPPER||"local-only-pepper-do-not-deploy-12345678",DB:sqlite(path.join(local,"narv.sqlite")),FRONTEND_URL:origin+"/",API_URL:origin,GITHUB_CLIENT_ID:process.env.GITHUB_CLIENT_ID||"",GITHUB_CLIENT_SECRET:process.env.GITHUB_CLIENT_SECRET||"",ORIGINAL_EDITOR_GITHUB_ID:process.env.ORIGINAL_EDITOR_GITHUB_ID||""};
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png",".woff2":"font/woff2"};
http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,origin);
 if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/auth/")||url.pathname==="/health"){
  const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>1600000){res.writeHead(413);res.end();return}chunks.push(c)}
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==="POST"?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==="/config.js"){res.writeHead(200,{"Content-Type":"text/javascript","Cache-Control":"no-store"});res.end('export const config = '+JSON.stringify({mode:"remote",apiBase:origin})+';');return}
 const publicRoot=path.join(root,"public"),file=path.resolve(publicRoot,"."+decodeURIComponent(url.pathname)+(url.pathname.endsWith("/")?"index.html":""));
 if(!file.startsWith(publicRoot+path.sep)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return}
 res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(await readFile(file));
 }catch{res.writeHead(500);res.end("Local API unavailable")}
}).listen(port,"::",()=>console.log("NARV database-backed preview: "+origin+" (GitHub OAuth requires configured HTTPS deployment)"));
const timer=setInterval(()=>scheduled(env).catch(e=>console.error("Scheduled task failed:",e.message)),60000);timer.unref();
