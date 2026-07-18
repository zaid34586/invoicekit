import { createClient } from "@supabase/supabase-js";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization"); if(!auth) return json({error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!; const anon=Deno.env.get("SUPABASE_ANON_KEY")!; const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:{user},error:ue}=await userClient.auth.getUser(); if(ue||!user) return json({error:"Unauthorized"},401);
  const {data:profile}=await admin.from("profiles").select("plan,is_pro,business_name").eq("user_id",user.id).maybeSingle();
  const {data:workspaceId,error:we}=await admin.rpc("ensure_workspace_for_owner",{p_owner:user.id}); if(we) throw we;
  const body=await req.json().catch(()=>({})); const action=body.action||"list";
  if(action==="list"){
   await admin.from("workspace_invitations").update({status:"expired"}).eq("workspace_id",workspaceId).eq("status","pending").lte("expires_at",new Date().toISOString());
   const [{data:members,error:me},{data:invites,error:ie}]=await Promise.all([
    admin.from("workspace_members").select("id,user_id,email,name,role,status,joined_at").eq("workspace_id",workspaceId).order("created_at"),
    admin.from("workspace_invitations").select("id,email,name,role,status,expires_at,created_at").eq("workspace_id",workspaceId).eq("status","pending").order("created_at",{ascending:false})
   ]); if(me||ie) throw me||ie;
   const plan=(profile?.plan||((profile?.is_pro)?"pro":"free")) as string; const limit=plan==="business"?null:plan==="pro"?3:0;
   return json({members,invites,plan,seatLimit:limit,seatsUsed:(members||[]).filter((m:any)=>m.role!=="owner"&&m.status==="active").length});
  }
  if(action==="invite"){
   const email=String(body.email||"").trim().toLowerCase(); const name=String(body.name||"").trim()||null; const role=String(body.role||"");
   if(!email||!["manager","accountant","staff"].includes(role)) return json({error:"Valid email and role are required"},400);
   const plan=(profile?.plan||((profile?.is_pro)?"pro":"free")) as string; const limit=plan==="business"?999999:plan==="pro"?3:0;
   const {count}=await admin.from("workspace_members").select("id",{count:"exact",head:true}).eq("workspace_id",workspaceId).neq("role","owner").eq("status","active");
   const {count:pending}=await admin.from("workspace_invitations").select("id",{count:"exact",head:true}).eq("workspace_id",workspaceId).eq("status","pending").gt("expires_at",new Date().toISOString());
   if((count||0)+(pending||0)>=limit) return json({error:limit===0?"Upgrade to Pro to invite team members.":"Team seat limit reached."},403);
   const {data:existing}=await admin.from("workspace_members").select("id").eq("workspace_id",workspaceId).ilike("email",email).maybeSingle(); if(existing) return json({error:"This person is already a workspace member."},409);
   const expires=new Date(Date.now()+7*86400000).toISOString();
   const {data:invite,error:ie}=await admin.from("workspace_invitations").insert({workspace_id:workspaceId,email,name,role,invited_by:user.id,expires_at:expires}).select().single();
   if(ie) return json({error:ie.code==="23505"?"A pending invitation already exists for this email.":ie.message},409);
   const redirectTo=`${req.headers.get("origin")||"https://getrivox.vercel.app"}/login?team_invite=1`;
   const {error:mailError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{workspace_invitation_id:invite.id,workspace_role:role,invited_name:name}});
   if(mailError){await admin.from("workspace_invitations").delete().eq("id",invite.id); return json({error:mailError.message},400);}
   return json({success:true,invite});
  }
  if(action==="update"){
   const id=String(body.memberId||""); const patch:any={updated_at:new Date().toISOString()};
   if(body.role&&["manager","accountant","staff"].includes(body.role)) patch.role=body.role;
   if(body.status&&["active","disabled"].includes(body.status)) patch.status=body.status;
   const {error}=await admin.from("workspace_members").update(patch).eq("id",id).eq("workspace_id",workspaceId).neq("role","owner"); if(error) throw error; return json({success:true});
  }
  if(action==="remove") {const {error}=await admin.from("workspace_members").delete().eq("id",body.memberId).eq("workspace_id",workspaceId).neq("role","owner"); if(error) throw error; return json({success:true});}
  if(action==="revoke") {const {error}=await admin.from("workspace_invitations").update({status:"revoked",updated_at:new Date().toISOString()}).eq("id",body.inviteId).eq("workspace_id",workspaceId); if(error) throw error; return json({success:true});}
  return json({error:"Unknown action"},400);
 }catch(e){console.error("workspace-team",e); return json({error:e instanceof Error?e.message:"Unexpected error"},500);}
});
