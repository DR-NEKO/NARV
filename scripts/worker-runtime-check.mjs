import assert from "node:assert/strict";
const base="http://127.0.0.1:8797";
const health=await fetch(base+"/health");assert.equal(health.status,200);assert.equal((await health.json()).authConfigured,false);
const response=await fetch(base+"/api/bootstrap");assert.equal(response.status,200);const data=await response.json();assert.equal(data.user,null);assert.deepEqual(data.submissions,[]);assert.deepEqual(data.articles,[]);
assert.equal((await fetch(base+"/api/bootstrap",{headers:{Origin:"https://untrusted.example"}})).status,403);
assert.equal((await fetch(base+"/api/command",{method:"POST",headers:{Origin:"https://dr-neko.github.io","Content-Type":"application/json"},body:JSON.stringify({name:"create",args:[]})})).status,401);
assert.equal((await fetch(base+"/cdn-cgi/local/scheduled")).status,200);
console.log("PASS: actual workerd + local D1 migration, bootstrap, CORS, unauthenticated write denial, scheduled handler.");
