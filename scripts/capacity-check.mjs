import http from "node:http";
import {performance} from "node:perf_hooks";
import {writeFile,mkdir} from "node:fs/promises";
// Reproducible LOCAL static-origin check. This is not a Cloudflare/GitHub SLA test.
const payload=Buffer.from(JSON.stringify({id:"capacity-fixture",title:"公开阅读容量验收",content:"实验背景、方法、数据与适用范围。".repeat(1500)}));
let requests=0,active=0,peak=0;
const server=http.createServer((req,res)=>{requests++;active++;peak=Math.max(peak,active);res.on("finish",()=>active--);res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"public,max-age=60","Content-Length":payload.length});res.end(payload)});await new Promise(r=>server.listen({port:0,host:"127.0.0.1",backlog:8192},r));
const url="http://127.0.0.1:"+server.address().port+"/content/articles/fixture.json",n=5000,times=[],start=performance.now();let errors=0;const errorKinds={};
await Promise.all(Array.from({length:n},(_,i)=>new Promise(resolve=>{const t=performance.now();let length=0;const done=()=>{times.push(performance.now()-t);resolve()};const req=http.get(url,{localAddress:i%2?"127.0.0.2":"127.0.0.3",agent:false},res=>{res.on("data",b=>length+=b.length);res.on("end",()=>{if(res.statusCode!==200||length!==payload.length)errors++;done()})});req.setTimeout(60000,()=>req.destroy(Error("Timeout")));req.on("error",e=>{errors++;errorKinds[e.code||e.name]=(errorKinds[e.code||e.name]||0)+1;done()})})));

const elapsed=performance.now()-start;await new Promise(r=>server.close(r));times.sort((a,b)=>a-b);
const report={scope:"Local HTTP static origin, 5000 concurrently initiated clients, two loopback source IPs; NOT cloud SLA",clients:n,requests,errors,errorKinds,bytesPerArticle:payload.length,totalMiB:+(payload.length*n/1048576).toFixed(2),elapsedMs:Math.round(elapsed),requestsPerSecond:Math.round(n*1000/elapsed),p50Ms:Math.round(times[Math.floor(n*.5)]),p95Ms:Math.round(times[Math.floor(n*.95)]),p99Ms:Math.round(times[Math.floor(n*.99)]),peakServerRequestHandlers:peak,databaseQueries:0,workerInvocations:0};
await mkdir("artifacts",{recursive:true});await writeFile("artifacts/capacity-check.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(errors)process.exitCode=1;
