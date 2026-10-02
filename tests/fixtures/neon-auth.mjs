// Explicitly preloaded ONLY by the production-login integration test.
// No application import or automatic fallback uses this fixture.
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
 if(new URL(url).hostname!=="api.neon.tech")return original(input,init);
 const mode=process.env.AUTH_TEST_DATABASE_MODE;
 if(mode==="missing-function")return new Response(JSON.stringify({message:"function consume_login_attempt(text) does not exist",code:"42883"}),{status:400,headers:{"Content-Type":"application/json"}});
 if(mode==="permission")return new Response(JSON.stringify({message:"permission denied",code:"42501"}),{status:400,headers:{"Content-Type":"application/json"}});
 if(mode==="failure")throw new Error("Injected test database failure containing SECRET_MUST_NOT_APPEAR");
 const body=JSON.parse(init.body);
 if(!body.query?.includes("consume_login_attempt"))throw new Error("Unexpected query in production login test");
 return new Response(JSON.stringify({fields:[{name:"allowed",dataTypeID:16}],rows:[["t"]],rowCount:1,command:"SELECT"}),{headers:{"Content-Type":"application/json"}});
};
