import { createClient } from "@supabase/supabase-js";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","X-RateLimit-Limit":"100"}});
const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});try{
 const raw=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""); if(!raw.startsWith("rvx_live_"))return respond({error:"Invalid API key"},401);
 const hash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))); const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:key}=await admin.from("workspace_api_keys").select("id,workspace_id,revoked_at,workspaces!inner(owner_user_id)").eq("key_hash",hash).maybeSingle();
 const relation=(key as any)?.workspaces; const {data:ownerProfile}=relation?.owner_user_id?await admin.from("profiles").select("plan,is_banned").eq("user_id",relation.owner_user_id).maybeSingle():{data:null}; if(!key||key.revoked_at||ownerProfile?.plan!=="business"||ownerProfile?.is_banned)return respond({error:"Invalid or revoked API key"},401);
 const windowStart=new Date(Math.floor(Date.now()/60000)*60000).toISOString(); const {data:usage}=await admin.from("workspace_api_rate_limits").select("request_count").eq("api_key_id",key.id).eq("window_start",windowStart).maybeSingle();
 if((usage?.request_count||0)>=100)return respond({error:"Rate limit exceeded"},429); await admin.from("workspace_api_rate_limits").upsert({api_key_id:key.id,window_start:windowStart,request_count:(usage?.request_count||0)+1}); await admin.from("workspace_api_keys").update({last_used_at:new Date().toISOString()}).eq("id",key.id);
 const path=new URL(req.url).pathname.split("/business-api")[1]||"/"; const owner=relation.owner_user_id;
 if(req.method!=="GET")return respond({error:"Method not allowed"},405);
 if(path==="/invoices"){const {data,error}=await admin.from("invoices").select("id,invoice_number,client_name,client_email,total,status,invoice_date,due_date,created_at").eq("user_id",owner).order("created_at",{ascending:false}).limit(100);if(error)throw error;return respond({data});}
 if(path.startsWith("/invoices/")){const id=path.split("/")[2];const {data,error}=await admin.from("invoices").select("*").eq("user_id",owner).eq("id",id).maybeSingle();if(error)throw error;return data?respond({data}):respond({error:"Not found"},404);}
 if(path==="/clients"){const {data,error}=await admin.from("clients").select("id,name,company_name,email,phone,country,created_at").eq("user_id",owner).order("created_at",{ascending:false}).limit(100);if(error)throw error;return respond({data});}
 return respond({error:"Endpoint not found"},404);
 }catch(e){console.error(e);return respond({error:e instanceof Error?e.message:"Unexpected error"},500)}});
