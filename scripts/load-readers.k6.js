import http from "k6/http";
import {check,sleep} from "k6";
const origin=__ENV.BASE_URL||"http://127.0.0.1:4186";
if(!/^http:\/\/(localhost|127\.[0-9.]+)(:[0-9]+)?$/.test(origin))throw Error("This rehearsal only runs against a local origin.");
export const options={
 discardResponseBodies:true,
 stages:[{duration:"10s",target:5000},{duration:"15s",target:5000},{duration:"5s",target:0}],
 thresholds:{"http_req_failed":["rate<0.001"],"http_req_duration":["p(95)<2000"],"checks":["rate>0.999"]},
 gracefulRampDown:"5s",gracefulStop:"5s",
 // The development host exposes only ~4096 ephemeral ports per source IP.
 localIPs:["127.0.1.10-127.0.1.29"],
 summaryTrendStats:["avg","med","p(90)","p(95)","p(99)","max"]
};
export default function(){
 const pages=["/content/catalog.json","/content/articles/fixture.json"];
 if(__VU%10===0)pages.push("/content/search/0.json");
 for(const path of pages){const r=http.get(origin+path,{tags:{resource:path.includes("/search/")?"search":path.includes("/articles/")?"article":"catalog"}});check(r,{"public content returns 200":r=>r.status===200})}
 sleep(5+__VU%11);
}
