import http from "node:http";
const article={id:"fixture",title:"公开阅读压力测试",author:"容量测试作者",category:"科研与实践",status:"published",publishedAt:"2026-09-28T00:00:00Z",date:"2026.09.28",summary:"完整文字稿件与公开中长评论。",content:"实验背景、方法、数据与适用范围。".repeat(1500),images:{}};
const doc=Buffer.from(JSON.stringify({article,comments:[{id:"comment",content:"公开审核后的回应。".repeat(100)}],votes:{up:100,down:2}})),catalog=Buffer.from(JSON.stringify({articles:[{...article,content:"",images:{}}],announcements:[]})),search=Buffer.from(JSON.stringify({articles:[article],comments:[]}));
let total=0;
http.createServer((req,res)=>{const payload=req.url.includes("/articles/")?doc:req.url.includes("/search/")?search:catalog;total++;res.writeHead(200,{"Content-Type":"application/json","Content-Length":payload.length,"Cache-Control":"public,max-age=60"});res.end(payload)}).listen({port:4186,host:"127.0.0.1",backlog:8192},()=>console.log("Local static-content origin http://127.0.0.1:4186; database calls: 0"));
process.on("SIGTERM",()=>{console.log("Requests served: "+total);process.exit(0)});
