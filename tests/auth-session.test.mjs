import test from "node:test";
import assert from "node:assert/strict";
import {getToken,saveToken,forgetToken,sessionKey} from "../public/auth-session.js";
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),clear:()=>data.clear()}};
test("登录凭据保存在持久存储；关闭标签页仍可恢复；退出清除两处",()=>{
 globalThis.localStorage=memory();globalThis.sessionStorage=memory();
 saveToken("a".repeat(43),Date.now()+30*86400000);sessionStorage.clear();assert.equal(getToken(),"a".repeat(43));
 forgetToken();assert.equal(getToken(),null);assert.equal(localStorage.getItem(sessionKey),null);
});
test("兼容旧标签页会话、切换账号与到期清理",()=>{
 globalThis.localStorage=memory();globalThis.sessionStorage=memory();
 sessionStorage.setItem(sessionKey,"a".repeat(43));assert.equal(getToken(),"a".repeat(43));assert.equal(sessionStorage.getItem(sessionKey),null);
 sessionStorage.setItem(sessionKey,"b".repeat(43));assert.equal(getToken(),"b".repeat(43));
 saveToken("c".repeat(43),Date.now()-1000);assert.equal(getToken(),null);
});
