import {test} from "node:test";
import assert from "node:assert/strict";
import {scryptSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {assertAuthConfiguration,AuthConfigurationError} from "../lib/auth-config.mjs";
const salt="test-salt";
const hash=salt+":"+scryptSync("SNPRocks",salt,64).toString("hex");
const secret="test-session-secret-with-at-least-32-characters";
test("production auth requires a valid scrypt password hash and a session secret",()=>{
 for(const [env,code] of [
  [{}, "AUTH_PASSWORD_HASH_MISSING"],
  [{ADMIN_PASSWORD_HASH:"SNPRocks"}, "AUTH_PASSWORD_HASH_INVALID"],
  [{ADMIN_PASSWORD_HASH:hash}, "AUTH_SESSION_SECRET_MISSING"],
  [{ADMIN_PASSWORD_HASH:hash,SESSION_SECRET:"short"}, "AUTH_SESSION_SECRET_INVALID"],
 ]){
  assert.throws(()=>assertAuthConfiguration(env),e=>e instanceof AuthConfigurationError&&e.code===code&&!e.message.includes("SNPRocks"));
 }
 assert.doesNotThrow(()=>assertAuthConfiguration({ADMIN_PASSWORD_HASH:hash,SESSION_SECRET:secret}));
 assert.throws(()=>assertAuthConfiguration({ADMIN_PASSWORD_HASH:hash+":extra",SESSION_SECRET:secret}),e=>e.code==="AUTH_PASSWORD_HASH_INVALID");
});
test("Vercel prebuild stops before database access if production login configuration is absent",()=>{
 const url="postgresql://owner:do-not-log-this-secret@ep-test.neon.tech/neondb?sslmode=require";
 const result=spawnSync("node",["scripts/migrate.mjs","--build"],{encoding:"utf8",env:{...process.env,VERCEL:"1",DATABASE_URL:url,ADMIN_PASSWORD_HASH:"",SESSION_SECRET:""}});
 assert.equal(result.status,1);
 assert.match(result.stderr,/ADMIN_PASSWORD_HASH/);
 assert.doesNotMatch(result.stdout+result.stderr,/do-not-log-this-secret|Creating and verifying/);
});
