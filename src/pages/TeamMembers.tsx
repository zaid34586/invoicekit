import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Role="owner"|"manager"|"accountant"|"staff";
type Member={id:string;user_id:string;email:string;name:string|null;role:Role;status:"active"|"disabled";joined_at:string;permissions?:string[]|null;custom_role_name?:string|null};
type Invite={id:string;email:string;name:string|null;role:Exclude<Role,"owner">;status:string;expires_at:string;created_at:string;email_status:"pending"|"sent"|"failed";email_sent_at:string|null;email_error:string|null;last_email_attempt_at:string|null;permissions?:string[]|null;custom_role_name?:string|null};
type RoleTemplate={id:string;name:string;permissions:string[]};
type TeamData={members:Member[];invites:Invite[];plan:"free"|"pro"|"business";seatLimit:number|null;seatsUsed:number;roleTemplates:RoleTemplate[]};
const roleHelp:{[K in Exclude<Role,"owner">]:string}={manager:"Dashboard, clients, invoices and reports",accountant:"Clients, invoices and reports",staff:"Clients and create/edit invoices"};
const permissionOptions=[
 ["dashboard.view","View dashboard"],["clients.view","View clients"],["clients.manage","Create and edit clients"],["invoices.view","View invoices"],["invoices.create","Create invoices"],["invoices.edit","Edit invoices"],["invoices.delete","Delete invoices"],["reports.view","View reports"],["support.view","Use support"]
] as const;
const defaults:Record<Exclude<Role,"owner">,string[]>={manager:["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","invoices.delete","reports.view","support.view"],accountant:["dashboard.view","clients.view","invoices.view","reports.view","support.view"],staff:["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","support.view"]};
const emptyForm={name:"",email:"",role:"manager" as Exclude<Role,"owner">};

async function invoke(body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke("workspace-team",{body});
 if(error) throw new Error((data as {error?:string}|null)?.error||error.message||"Team request failed");
 if(data?.error) throw new Error(data.error);
 return data;
}
export default function TeamMembers(){
 const [data,setData]=useState<TeamData|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
 const [form,setForm]=useState(emptyForm);
 const [editing,setEditing]=useState<Member|null>(null); const [customRole,setCustomRole]=useState(""); const [permissions,setPermissions]=useState<string[]>([]);
 const [useCustom,setUseCustom]=useState(false); const [inviteRoleName,setInviteRoleName]=useState(""); const [invitePerms,setInvitePerms]=useState<string[]>([]);
 const [justInvited,setJustInvited]=useState<{email:string;name:string|null;label:string}|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError("");try{setData(await invoke({action:"list"}));}catch(e){setError(e instanceof Error?e.message:"Unable to load team");}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);

 function pickTemplate(t:RoleTemplate){setUseCustom(true);setInviteRoleName(t.name);setInvitePerms(t.permissions)}
 function resetInviteExtras(){setUseCustom(false);setInviteRoleName("");setInvitePerms([])}

 async function invite(e:React.FormEvent){
  e.preventDefault();
  if(useCustom&&(!inviteRoleName.trim()||invitePerms.length===0)){setError("Give the custom role a name and pick at least one permission.");return}
  setSaving(true);setError("");setSuccess("");
  try{
   const body:Record<string,unknown>={action:"invite",...form};
   if(useCustom){body.customRoleName=inviteRoleName.trim();body.permissions=invitePerms}
   const result=await invoke(body);
   const label=useCustom?inviteRoleName.trim():form.role;
   const wasCustom=useCustom; const savedPerms=invitePerms; const savedName=inviteRoleName.trim();
   setForm(emptyForm);resetInviteExtras();
   setSaving(false);
   if(result.emailSent){
    setJustInvited({email:form.email,name:form.name||null,label});
    if(wasCustom) void invoke({action:"save_template",name:savedName,permissions:savedPerms}).then(()=>load());
   } else {
    setError(`Invitation created, but email delivery failed: ${result.emailError||"Email provider rejected the message"}. Fix SMTP, then use Resend.`);
   }
   void load();
  }catch(e){setError(e instanceof Error?e.message:"Invite failed");setSaving(false);}
 }
 async function action(body:Record<string,unknown>,message:string){setError("");setSuccess("");try{await invoke(body);setSuccess(message);void load();}catch(e){setError(e instanceof Error?e.message:"Action failed");}}
 function openPermissions(m:Member){setEditing(m);setCustomRole(m.custom_role_name||"");setPermissions(m.permissions||defaults[m.role as Exclude<Role,"owner">]||[])}
 async function savePermissions(){if(!editing)return;await action({action:"update",memberId:editing.id,permissions,customRoleName:customRole},"Custom permissions saved.");setEditing(null)}
 async function deleteTemplate(id:string){if(!confirm("Delete this reusable role?"))return;await action({action:"delete_template",templateId:id},"Role template deleted.")}
 const limit=data?.seatLimit; const full=typeof limit==="number" && (data?.seatsUsed||0)+(data?.invites.length||0)>=limit;
 const isBusiness=data?.plan==="business";
 return <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
  <section className="rounded-[28px] bg-gradient-to-r from-violet-950 via-violet-900 to-indigo-800 p-7 sm:p-9 text-white shadow-xl">
   <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-violet-200">Workspace access</p><h1 className="mt-3 text-3xl font-black">Team Members</h1><p className="mt-2 max-w-2xl text-violet-100">Invite your team, assign roles and control access without sharing the owner password.</p></div>
   <div className="min-w-[250px] rounded-2xl bg-white/10 px-6 py-4 backdrop-blur">{loading&&!data?<><div className="h-3 w-24 animate-pulse rounded bg-white/20"/><div className="mt-3 h-8 w-48 animate-pulse rounded bg-white/20"/></>:<><p className="text-xs font-bold uppercase text-violet-200">{data?.plan} plan</p><p className="mt-1 text-2xl font-black">{data?.seatsUsed||0} / {limit===null?"Unlimited":limit} seats used</p>{isBusiness&&<p className="mt-1 text-xs text-violet-200">Custom roles & unlimited seats enabled</p>}</>}</div></div>
  </section>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">{error}</div>}{success&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-semibold text-emerald-700">{success}</div>}
  <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
   <form onSubmit={invite} className="card h-fit p-6 space-y-5"><div><h2 className="text-xl font-bold text-slate-900">Invite a member</h2><p className="mt-1 text-sm text-slate-500">Invitations expire after 7 days. Duplicate pending invites are blocked.</p></div>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Name (optional)</span><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Email</span><input required type="email" className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900"><p className="font-bold">Secure invitation</p><p className="mt-1 text-violet-700">The member receives an email, creates their own password, and then joins this workspace. The owner never sees their password.</p></div>

    {!useCustom&&<label className="block"><span className="mb-2 block text-sm font-semibold">Role</span><select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value as Exclude<Role,"owner">})}><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="staff">Staff</option></select></label>}
    {!useCustom&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><b className="capitalize">{form.role}:</b> {roleHelp[form.role]}</div>}

    {isBusiness&&<div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-4 space-y-3">
     <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={useCustom} onChange={e=>{setUseCustom(e.target.checked);if(!e.target.checked)resetInviteExtras()}}/><span className="text-sm font-bold text-violet-900">✨ Use a custom role (Business)</span></label>
     {useCustom&&<>
      {data.roleTemplates.length>0&&<div><p className="mb-1.5 text-xs font-bold uppercase text-violet-700">Saved roles</p><div className="flex flex-wrap gap-1.5">{data.roleTemplates.map(t=><span key={t.id} className="group inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-bold text-violet-700"><button type="button" onClick={()=>pickTemplate(t)} className="hover:underline">{t.name}</button><button type="button" title="Delete" onClick={()=>void deleteTemplate(t.id)} className="text-violet-300 hover:text-red-500">×</button></span>)}</div></div>}
      <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-violet-700">Custom role name</span><input className="input" maxLength={40} placeholder="e.g. Sales Lead" value={inviteRoleName} onChange={e=>setInviteRoleName(e.target.value)}/></label>
      <div><p className="mb-1.5 text-xs font-bold uppercase text-violet-700">Permissions</p><div className="grid gap-1.5 sm:grid-cols-2">{permissionOptions.map(([key,label])=><label key={key} className="flex items-center gap-2 rounded-lg border border-violet-100 bg-white p-2 text-xs"><input type="checkbox" checked={invitePerms.includes(key)} onChange={()=>setInvitePerms(invitePerms.includes(key)?invitePerms.filter(p=>p!==key):[...invitePerms,key])}/><span className="font-semibold">{label}</span></label>)}</div></div>
      <p className="text-xs text-violet-600">This will be saved as a reusable role for future invites.</p>
     </>}
    </div>}

    <button disabled={saving||full} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">{saving?"Sending...":full?"Seat limit reached":"Send invitation"}</button>
    {data?.plan==="free"&&<p className="text-center text-sm font-medium text-amber-700">Upgrade to Pro to add up to 3 members.</p>}
    {data?.plan==="pro"&&<p className="text-center text-sm font-medium text-violet-700">Upgrade to Business for unlimited seats and custom roles.</p>}
   </form>
   <div className="space-y-6">
    <section className="card overflow-hidden"><div className="border-b px-6 py-5"><h2 className="text-xl font-bold">Active members</h2></div><div className="divide-y">{loading&&!data?<p className="p-6 text-slate-500">Loading team...</p>:data?.members.length?data.members.map(m=><div key={m.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">{m.name||m.email}</p><p className="text-sm text-slate-500">{m.email}</p><div className="mt-2 flex gap-2"><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold capitalize text-violet-700">{m.custom_role_name||m.role}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${m.status==="active"?"bg-emerald-100 text-emerald-700":"bg-slate-200 text-slate-600"}`}>{m.status}</span></div></div>{m.role!=="owner"&&<div className="flex flex-wrap gap-2"><select className="input !w-auto" value={m.role} onChange={e=>void action({action:"update",memberId:m.id,role:e.target.value},"Role updated.")}><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="staff">Staff</option></select>{isBusiness&&<button className="btn-secondary" onClick={()=>openPermissions(m)}>Permissions</button>}<button className="btn-secondary" onClick={()=>void action({action:"update",memberId:m.id,status:m.status==="active"?"disabled":"active"},m.status==="active"?"Member disabled.":"Member enabled.")}>{m.status==="active"?"Disable":"Enable"}</button><button className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50" onClick={()=>confirm("Remove this member?")&&void action({action:"remove",memberId:m.id},"Member removed.")}>Remove</button></div>}</div>):<p className="p-6 text-slate-500">No active team members yet.</p>}</div></section>
    <section className="card overflow-hidden"><div className="border-b px-6 py-5"><h2 className="text-xl font-bold">Pending invitations</h2></div><div className="divide-y">{data?.invites.length?data.invites.map(i=><div key={i.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{i.name||i.email}</p><p className="text-sm text-slate-500">{i.email} · <span className="capitalize">{i.custom_role_name||i.role}</span></p><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${i.email_status==="sent"?"bg-emerald-100 text-emerald-700":i.email_status==="failed"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>Email {i.email_status}</span><span className="text-xs text-slate-400">Expires {new Date(i.expires_at).toLocaleString()}</span></div>{i.email_error&&<p className="mt-2 max-w-xl text-xs font-medium text-red-600">{i.email_error}</p>}</div><div className="flex gap-2"><button className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-bold text-violet-700" onClick={()=>void action({action:"resend",inviteId:i.id},"Fresh invitation email sent. The previous invitation link is now invalid.")}>Resend</button><button className="rounded-xl border px-4 py-2 text-sm font-bold" onClick={()=>void action({action:"revoke",inviteId:i.id},"Invitation revoked.")}>Revoke</button></div></div>):<p className="p-6 text-slate-500">No pending invitations.</p>}</div></section>
   </div>
  </div>

  {editing&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-black">Permission editor</h2><p className="text-sm text-slate-500">{editing.email}</p></div><button onClick={()=>setEditing(null)} className="text-2xl">×</button></div><label className="mt-5 block"><span className="mb-2 block text-sm font-bold">Custom role name</span><input className="input" value={customRole} maxLength={40} placeholder="e.g. Sales Lead" onChange={e=>setCustomRole(e.target.value)}/></label><div className="mt-5 grid gap-3 sm:grid-cols-2">{permissionOptions.map(([key,label])=><label key={key} className="flex items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={permissions.includes(key)} onChange={()=>setPermissions(permissions.includes(key)?permissions.filter(p=>p!==key):[...permissions,key])}/><span className="text-sm font-semibold">{label}</span></label>)}</div><div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={()=>setEditing(null)}>Cancel</button><button className="btn-primary" onClick={()=>void savePermissions()}>Save permissions</button></div></div></div>}

  {justInvited&&<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4" onClick={()=>setJustInvited(null)}>
   <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl animate-pop-in" onClick={e=>e.stopPropagation()}>
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
     <svg viewBox="0 0 52 52" className="h-10 w-10"><circle cx="26" cy="26" r="24" fill="none" stroke="#059669" strokeWidth="2" opacity="0.25"/><path fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M14 27l7 7 17-17" className="animate-draw-check"/></svg>
    </div>
    <h3 className="mt-5 text-xl font-black text-slate-950">Invitation sent!</h3>
    <p className="mt-2 text-sm text-slate-500">{justInvited.name||justInvited.email} has been invited as <span className="font-bold capitalize text-violet-700">{justInvited.label}</span>. They'll get an email to set up their password.</p>
    <button onClick={()=>setJustInvited(null)} className="btn-primary mt-6 w-full">Done</button>
   </div>
  </div>}
 </div>;
}
