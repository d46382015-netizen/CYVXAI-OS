"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const{createSparkServer}=require("../spark/server");
const{SparkRuntime}=require("../spark/runtime");

test("untrusted forwarding headers cannot reset rate limits",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"spark-security-"));
  const runtime=new SparkRuntime({filePath:path.join(root,"state.json"),artifactRoot:path.join(root,"worlds")});
  const{server}=createSparkServer({runtime,requestLimit:1,trustProxy:false,logPath:path.join(root,"runtime.log")});
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const first=await fetch(`${base}/healthz`,{headers:{"x-forwarded-for":"10.0.0.1"}});
    const second=await fetch(`${base}/healthz`,{headers:{"x-forwarded-for":"10.0.0.2"}});
    assert.equal(first.status,200);
    assert.equal(second.status,429);
  }finally{await new Promise((resolve)=>server.close(resolve))}
});
