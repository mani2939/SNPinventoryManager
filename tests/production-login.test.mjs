import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {scryptSync} from "node:crypto";
import {once} from "node:events";
import path from "node:path";
const salt="production-test-salt";
const hash=salt+":"+scryptSync("SNPRocks",salt,64).toString("hex");
const session="production-test-session-secret-with-at-least-32-characters";

async function start(extra){
 const port=3026;
 let logs="";
 const child=spawn(process.execPath,["--import",path.resolve("tests/fixtures/neon-auth.mjs"),"node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
  env:{...process.env,NODE_ENV:"production",VERCEL:"1",DEMO_MODE:"false",DATABASE_URL:"postgresql://owner:test-credential@ep-auth-test.neon.tech/neondb?sslmode=require",ADMIN_USERNAME:"SNPAdmin",ADMIN_PASSWORD_HASH:hash,SESSION_SECRET:session,...extra},
  stdio:["ignore","pipe","pipe"],
 });
 child.stdout.on("data",b=>logs+=b);child.stderr.on("data",b=>logs+=b);
 const base="http://127.0.0.1:"+port;
 try{
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw new Error("Production test server exited.");
   try{const response=await fetch(base+"/login");if(response.status===200)return {base,logs:()=>logs,child}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  throw new Error("Production test server did not start.");
 }catch(error){child.kill("SIGTERM");throw error}
}
async function stop(server){const ended=once(server.child,"exit");server.child.kill("SIGTERM");await ended;}
async function login(server,password="SNPRocks"){
 return fetch(server.base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:server.base.replace("http:","https:")},body:JSON.stringify({username:"SNPAdmin",password})});
}
test("actual production login reports config/DB failures safely and sets a valid session", {timeout:60000},async()=>{
 for(const [extra,expected,message] of [
  [{ADMIN_PASSWORD_HASH:""},"AUTH_PASSWORD_HASH_MISSING","ADMIN_PASSWORD_HASH"],
  [{SESSION_SECRET:""},"AUTH_SESSION_SECRET_MISSING","SESSION_SECRET"],
  [{AUTH_TEST_DATABASE_MODE:"missing-function"},"AUTH_DATABASE_UNAVAILABLE","migration"],
  [{AUTH_TEST_DATABASE_MODE:"permission"},"AUTH_DATABASE_UNAVAILABLE","owner-role"],
  [{AUTH_TEST_DATABASE_MODE:"failure"},"AUTH_DATABASE_UNAVAILABLE","DATABASE_URL"],
 ]){
  const server=await start(extra);
  try{
   const response=await login(server);assert.equal(response.status,500);
   const body=await response.json();assert.equal(body.code,expected);assert.match(body.error,new RegExp(message));
   assert.ok(body.requestId);assert.equal(response.headers.get("X-Request-Id"),body.requestId);
   assert.doesNotMatch(JSON.stringify(body)+server.logs(),/SNPRocks|test-credential|SECRET_MUST_NOT_APPEAR/);
  }finally{await stop(server)}
 }
 const server=await start({});
 try{
  assert.equal((await login(server,"wrong")).status,401);
  const response=await login(server);assert.equal(response.status,200);
  const cookie=response.headers.get("Set-Cookie");assert.ok(cookie);
  assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=strict/i);
  const page=await fetch(server.base+"/inventory",{headers:{Cookie:cookie.split(";")[0]},redirect:"manual"});
  assert.equal(page.status,200);
  const rejected=await fetch(server.base+"/inventory",{redirect:"manual"});assert.equal(rejected.status,307);
 }finally{await stop(server)}
});
