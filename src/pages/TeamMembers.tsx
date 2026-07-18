import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Role="owner"|"manager"|"accountant"|"staff";
type Member={id:string;user_id:string;email:string;name:string|null;role:Role;status:"active"|"disabled";joined_at:string};
type Invite={id:string;email:string;name:string|null;role:Exclude<Role,"owner">;status:string;expires_at:string;created_at:string};
type TeamData={members:Member[];invites:Invite[];plan:"free"|"pro"|"business";seatLimit:number|null;seatsUsed:number};
const roleHelp:{[K in Exclude<Role,"owner">]:string}={manager:"Dashboard, clients, invoices and reports",accountant:"Clients, invoices and reports",staff:"Clients and create/edit invoices"};

async function invoke(body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke("workspace-team",{body});
 if(error) throw new Error((data as {error?:string}|null)?.error||error.message||"Team request failed");
 if(data?.error) throw new Error(data.error);
 return data;
}
export default function TeamMembers(){
 const [data,setData]=useState<TeamData|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
 const [form,setForm]=useState({name:"",email:"",password:"",role:"manager" as Exclude<Role,"owner">});
 const load=useCallback(async()=>{setLoading(true);setError("");try{setData(await invoke({action:"list"}));}catch(e){setError(e instanceof Error?e.message:"Unable to load team");}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function invite(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");setSuccess("");try{const result=await invoke({action:"invite",...form});setForm({name:"",email:"",password:"",role:"manager"});setSuccess(result.emailSent?"Member login created and credentials emailed successfully.":"Member login created. Email could not be sent; securely share the temporary password.");await load();}catch(e){setError(e instanceof Error?e.message:"Invite failed");}finally{setSaving(false);}}
 async function action(body:Record<string,unknown>,message:string){setError("");setSuccess("");try{await invoke(body);setSuccess(message);await load();}catch(e){setError(e instanceof Error?e.message:"Action failed");}}
 const limit=data?.seatLimit; const full=typeof limit==="number" && (data?.seatsUsed||0)+(data?.invites.length||0)>=limit;
 return <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
  <section className="rounded-[28px] bg-gradient-to-r from-violet-950 via-violet-900 to-indigo-800 p-7 sm:p-9 text-white shadow-xl">
   <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-violet-200">Workspace access</p><h1 className="mt-3 text-3xl font-black">Team Members</h1><p className="mt-2 max-w-2xl text-violet-100">Invite your team, assign roles and control access without sharing the owner password.</p></div>
   <div className="rounded-2xl bg-white/10 px-6 py-4 backdrop-blur"><p className="text-xs font-bold uppercase text-violet-200">{data?.plan||"..."} plan</p><p className="mt-1 text-2xl font-black">{data?.seatsUsed||0} / {limit===null?"Unlimited":limit} seats used</p></div></div>
  </section>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">{error}</div>}{success&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-semibold text-emerald-700">{success}</div>}
  <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
   <form onSubmit={invite} className="card h-fit p-6 space-y-5"><div><h2 className="text-xl font-bold text-slate-900">Invite a member</h2><p className="mt-1 text-sm text-slate-500">Invitations expire after 7 days. Duplicate pending invites are blocked.</p></div>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Name (optional)</span><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Email</span><input required type="email" className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Temporary password</span><input required minLength={8} type="password" autoComplete="new-password" className="input" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimum 8 characters"/><span className="mt-2 block text-xs text-slate-500">The member must change this password on first login.</span></label>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Role</span><select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value as Exclude<Role,"owner">})}><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="staff">Staff</option></select></label>
    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><b className="capitalize">{form.role}:</b> {roleHelp[form.role]}</div>
    <button disabled={saving||full} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">{saving?"Sending...":full?"Seat limit reached":"Send invitation"}</button>
    {data?.plan==="free"&&<p className="text-center text-sm font-medium text-amber-700">Upgrade to Pro to add up to 3 members.</p>}
   </form>
   <div className="space-y-6">
    <section className="card overflow-hidden"><div className="border-b px-6 py-5"><h2 className="text-xl font-bold">Active members</h2></div><div className="divide-y">{loading?<p className="p-6 text-slate-500">Loading team...</p>:data?.members.length?data.members.map(m=><div key={m.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">{m.name||m.email}</p><p className="text-sm text-slate-500">{m.email}</p><div className="mt-2 flex gap-2"><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold capitalize text-violet-700">{m.role}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${m.status==="active"?"bg-emerald-100 text-emerald-700":"bg-slate-200 text-slate-600"}`}>{m.status}</span></div></div>{m.role!=="owner"&&<div className="flex flex-wrap gap-2"><select className="input !w-auto" value={m.role} onChange={e=>void action({action:"update",memberId:m.id,role:e.target.value},"Role updated.")}><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="staff">Staff</option></select><button className="btn-secondary" onClick={()=>void action({action:"update",memberId:m.id,status:m.status==="active"?"disabled":"active"},m.status==="active"?"Member disabled.":"Member enabled.")}>{m.status==="active"?"Disable":"Enable"}</button><button className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50" onClick={()=>confirm("Remove this member?")&&void action({action:"remove",memberId:m.id},"Member removed.")}>Remove</button></div>}</div>):<p className="p-6 text-slate-500">No active team members yet.</p>}</div></section>
    <section className="card overflow-hidden"><div className="border-b px-6 py-5"><h2 className="text-xl font-bold">Pending invitations</h2></div><div className="divide-y">{data?.invites.length?data.invites.map(i=><div key={i.id} className="flex items-center justify-between gap-4 p-5"><div><p className="font-bold">{i.name||i.email}</p><p className="text-sm text-slate-500">{i.email} · <span className="capitalize">{i.role}</span></p><p className="mt-1 text-xs text-slate-400">Expires {new Date(i.expires_at).toLocaleDateString()}</p></div><button className="rounded-xl border px-4 py-2 text-sm font-bold" onClick={()=>void action({action:"revoke",inviteId:i.id},"Invitation revoked.")}>Revoke</button></div>):<p className="p-6 text-slate-500">No pending invitations.</p>}</div></section>
   </div>
  </div>
 </div>;
}
