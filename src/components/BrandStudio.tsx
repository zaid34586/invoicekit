import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { applyBrandPreset, brandingFont, type BrandTemplate, type WorkspaceBranding } from "../lib/branding";
import SignatureStampStudio from "./SignatureStampStudio";

const templates:{id:BrandTemplate;name:string;description:string}[]=[
 {id:"modern",name:"Modern",description:"Bright SaaS design"},
 {id:"executive",name:"Executive",description:"Dark professional header"},
 {id:"minimal",name:"Minimal",description:"Simple and spacious"},
 {id:"corporate",name:"Corporate",description:"Formal business invoice"},
 {id:"luxury",name:"Luxury",description:"Black and gold editorial"},
 {id:"slate",name:"Slate",description:"Deep 3D-style depth, cool tones"},
 {id:"emerald",name:"Emerald",description:"Premium green and gold"},
];
type PreviewMode="desktop"|"mobile"|"pdf";

export default function BrandStudio({value,onChange,onSave,profile,saving,saved}:{value:WorkspaceBranding;onChange:(v:WorkspaceBranding)=>void;onSave:()=>void;profile:Profile;saving?:boolean;saved?:boolean}){
 const [uploading,setUploading]=useState("");
 const [preview,setPreview]=useState<PreviewMode>("desktop");
 const set=<K extends keyof WorkspaceBranding>(key:K,val:WorkspaceBranding[K])=>onChange({...value,[key]:val});
 async function upload(kind:"logo_url"|"signature_url"|"stamp_url",file?:File){
  if(!file)return; setUploading(kind);
  const ext=file.name.split(".").pop()?.toLowerCase()||"png";
  const path=`${profile.user_id}/${kind}-${Date.now()}.${ext}`;
  const {error}=await supabase.storage.from("brand-assets").upload(path,file,{contentType:file.type,upsert:false});
  if(!error){const {data}=supabase.storage.from("brand-assets").getPublicUrl(path);set(kind,data.publicUrl)}
  setUploading("");
 }
 const dark=value.pdf_template==="executive"||value.pdf_template==="luxury"||value.pdf_template==="slate";
 const header=value.pdf_template==="luxury"?"bg-stone-950 text-amber-100":value.pdf_template==="executive"?"bg-slate-950 text-white":value.pdf_template==="slate"?"bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white shadow-inner":value.pdf_template==="emerald"?"bg-gradient-to-r from-emerald-900 to-emerald-800 text-white":value.pdf_template==="corporate"?"border-t-8 bg-blue-50":value.pdf_template==="minimal"?"bg-white":"bg-gradient-to-r from-violet-50 to-indigo-50";
 const [studio,setStudio]=useState<null|"signature_url"|"stamp_url">(null);
 return <>
 <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
  <div className="space-y-6">
   <section className="card p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Invoice Design Center</p><h2 className="mt-2 text-2xl font-black">Choose invoice style</h2><p className="mt-1 text-slate-500">Select one layout. You can customize its colors and content below.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Business</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{templates.map(t=><button key={t.id} onClick={()=>onChange(applyBrandPreset(value,t.id))} className={`rounded-2xl border p-3 text-left transition ${value.pdf_template===t.id?"border-violet-500 bg-violet-50 ring-2 ring-violet-100":"hover:border-slate-300 hover:shadow-md"}`}><TemplateThumb template={t.id}/><div className="mt-3 flex items-center justify-between"><b>{t.name}</b>{value.pdf_template===t.id&&<span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black text-white">SELECTED</span>}</div><p className="text-xs text-slate-500">{t.description}</p></button>)}</div></section>

   <section className="card p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Step 2</p><h3 className="mt-2 text-xl font-black">Brand identity</h3>

    <div className="mt-5">
     <label className="mb-2 block text-sm font-bold">Company logo</label>
     <label className="flex items-center gap-4 rounded-2xl border border-dashed p-4">{value.logo_url?<img src={value.logo_url} className="h-14 w-14 rounded-xl object-contain"/>:<div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-50 text-[10px] text-slate-400">None</div>}<div className="flex-1"><input type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-xs" onChange={e=>void upload("logo_url",e.target.files?.[0])}/><span className="mt-1 block text-xs text-slate-400">{uploading==="logo_url"?"Uploading...":"PNG, JPG or WebP"}</span></div></label>
    </div>

    <div className="mt-6 grid gap-5 md:grid-cols-2">
     {([["signature_url","Signature"],["stamp_url","Company stamp"]] as const).map(([key,label])=>
      <div key={key} className="rounded-2xl border p-4">
       <div className="flex items-center justify-between"><b className="text-sm">{label}</b>{value[key]&&<button type="button" onClick={()=>set(key,"")} className="text-xs font-bold text-slate-400 hover:text-rose-600">Remove</button>}</div>
       <div className="mt-3 grid h-20 place-items-center rounded-xl bg-slate-50">{value[key]?<img src={value[key]} className="h-16 max-w-full object-contain" alt={label}/>:<span className="text-xs text-slate-400">Not set yet</span>}</div>
       <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={()=>setStudio(key)} className="rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-primary-600">🎨 Design it</button>
        <label className="cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-bold text-slate-600 transition hover:bg-slate-50">{uploading===key?"Uploading...":"Upload photo"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>void upload(key,e.target.files?.[0])}/></label>
       </div>
      </div>
     )}
    </div>

    <div className="mt-6 grid gap-5 md:grid-cols-2"><Color label="Primary color" value={value.brand_color} set={v=>set("brand_color",v)}/><Color label="Accent color" value={value.accent_color} set={v=>set("accent_color",v)}/><Select label="Typography" value={value.font_family} options={["modern","classic","editorial"]} set={v=>set("font_family",v as WorkspaceBranding['font_family'])}/><Select label="Table style" value={value.table_style} options={["solid","soft","lines"]} set={v=>set("table_style",v as WorkspaceBranding['table_style'])}/></div>
   </section>

   <section className="card p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Step 3</p><h3 className="mt-2 text-xl font-black">Invoice content</h3><div className="mt-5 grid gap-4"><Field label="Document title" value={value.invoice_title} set={v=>set("invoice_title",v.toUpperCase().slice(0,30))}/><Field label="Background watermark (optional)" value={value.background_watermark} set={v=>set("background_watermark",v.slice(0,40))}/><Area label="Payment instructions" value={value.payment_instructions} set={v=>set("payment_instructions",v)}/><Area label="Terms & conditions" value={value.terms_text} set={v=>set("terms_text",v)}/><Field label="Footer message" value={value.footer_text} set={v=>set("footer_text",v)}/></div><div className="mt-5 flex flex-wrap gap-5"><Check label="Show signature" checked={value.show_signature} set={v=>set("show_signature",v)}/><Check label="Show company stamp" checked={value.show_stamp} set={v=>set("show_stamp",v)}/><Check label="Remove Rivox branding" checked={value.remove_rivox_branding} set={v=>set("remove_rivox_branding",v)}/></div></section>

   <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="font-black text-violet-950">Ready to apply?</p><p className="mt-1 text-sm text-violet-700">This design will be used on owner invoice preview, customer share links and new PDF downloads.</p><button className="btn-primary mt-4 px-8 inline-flex items-center gap-2 disabled:opacity-70" onClick={onSave} disabled={saving}>{saving?<><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Saving…</>:saved?<><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Saved & Applied</>:"Save & Apply Branding"}</button></section>
  </div>

  <aside className="xl:sticky xl:top-24 xl:h-fit"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Live preview</p><div className="flex rounded-xl border bg-white p-1">{(["desktop","mobile","pdf"] as PreviewMode[]).map(m=><button key={m} onClick={()=>setPreview(m)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase ${preview===m?"bg-slate-950 text-white":"text-slate-500"}`}>{m}</button>)}</div></div><div className={`${preview==="mobile"?"mx-auto max-w-[290px]":preview==="pdf"?"mx-auto max-w-[370px]":""}`}><div className={`overflow-hidden border bg-white shadow-xl ${preview==="pdf"?"rounded-none":"rounded-[24px]"}`} style={{fontFamily:brandingFont(value.font_family)}}><div className={`relative p-6 ${header}`} style={value.pdf_template==="corporate"?{borderTopColor:value.brand_color}:{}}>{value.background_watermark&&<span className="absolute inset-0 grid place-items-center text-3xl font-black opacity-[.05]">{value.background_watermark}</span>}<div className={`relative flex justify-between gap-3 ${value.pdf_template==="minimal"?"items-start":"items-center"}`}>{value.logo_url?<img src={value.logo_url} className="h-12 w-12 rounded-lg bg-white object-contain"/>:<div className="h-12 w-12 rounded-lg" style={{background:value.brand_color}}/>}<div className="flex-1"><b>{profile.business_name||"Your Business"}</b><p className={`text-xs ${dark?"opacity-70":"text-slate-500"}`}>{profile.email}</p></div><div className="text-right"><span className="rounded-md px-2 py-1 text-[10px] font-black text-white" style={{background:value.brand_color}}>{value.invoice_title||"INVOICE"}</span><p className="mt-2 text-xs font-bold">INV-001</p></div></div></div><div className="p-6"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Bill to</p><b>Example Customer</b><div className="mt-5"><div className="grid grid-cols-[1fr_auto] gap-3 p-3 text-xs font-bold" style={value.table_style==="solid"?{background:value.brand_color,color:"white"}:value.table_style==="soft"?{background:value.brand_color+"18",color:value.brand_color}:{borderBottom:`2px solid ${value.brand_color}`}}><span>Professional service</span><span>$1,250.00</span></div></div><div className="ml-auto mt-5 flex w-48 justify-between border-t pt-3 text-sm"><span>Total</span><b>$1,250.00</b></div>{value.payment_instructions&&<div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs"><b>Payment instructions</b><p className="mt-1">{value.payment_instructions}</p></div>}{value.terms_text&&<div className="mt-4 border-t pt-3 text-[10px] text-slate-500"><b>Terms & conditions</b><p>{value.terms_text}</p></div>}{(value.show_signature&&value.signature_url)||(value.show_stamp&&value.stamp_url)?<div className="mt-6 flex justify-end gap-4 border-t pt-4">{value.show_signature&&value.signature_url&&<img src={value.signature_url} className="h-14 object-contain" alt="Signature"/>}{value.show_stamp&&value.stamp_url&&<img src={value.stamp_url} className="h-14 object-contain" alt="Stamp"/>}</div>:null}<p className="mt-7 text-center text-sm font-bold" style={{color:value.accent_color}}>{value.footer_text}</p>{!value.remove_rivox_branding&&<p className="mt-2 text-center text-[10px] text-slate-400">Created with Rivox</p>}</div></div></div></aside>
 </div>
 {studio&&<SignatureStampStudio mode={studio==="signature_url"?"signature":"stamp"} defaultName={studio==="signature_url"?(profile.business_name||""):(profile.business_name||"")} brandColor={value.brand_color} onClose={()=>setStudio(null)} onApply={(dataUrl)=>{set(studio,dataUrl);setStudio(null)}}/>}
 </>
}

function Field({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label><span className="mb-2 block text-sm font-bold">{label}</span><input className="input" value={value||""} onChange={e=>set(e.target.value)}/></label>}
function Area({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label><span className="mb-2 block text-sm font-bold">{label}</span><textarea className="input min-h-24" value={value||""} onChange={e=>set(e.target.value)}/></label>}
function Color({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label><span className="mb-2 block text-sm font-bold">{label}</span><div className="flex gap-2"><input type="color" className="h-12 w-16 rounded-lg border" value={value} onChange={e=>set(e.target.value)}/><input className="input" value={value} onChange={e=>set(e.target.value)}/></div></label>}
function Select({label,value,options,set}:{label:string;value:string;options:string[];set:(v:string)=>void}){return <label><span className="mb-2 block text-sm font-bold">{label}</span><select className="input capitalize" value={value} onChange={e=>set(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>}
function Check({label,checked,set}:{label:string;checked:boolean;set:(v:boolean)=>void}){return <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={checked} onChange={e=>set(e.target.checked)}/>{label}</label>}
function TemplateThumb({template}:{template:BrandTemplate}){const e=template==="executive",l=template==="luxury",m=template==="minimal",c=template==="corporate",s=template==="slate",em=template==="emerald";return <div className="h-20 overflow-hidden rounded-xl border bg-white"><div className={`h-7 ${e?"bg-slate-950":l?"bg-gradient-to-r from-stone-950 to-amber-800":s?"bg-gradient-to-br from-slate-700 via-slate-900 to-black shadow-inner":em?"bg-gradient-to-r from-emerald-900 to-emerald-700":c?"border-t-4 border-blue-700 bg-blue-50":m?"bg-white":"bg-gradient-to-r from-violet-600 to-indigo-500"}`}/><div className="p-2"><div className={`h-2 ${l?"bg-amber-500":em?"bg-amber-400":s?"bg-sky-400":c?"bg-blue-600":m?"border-b":"bg-violet-500"}`}/><div className="mt-2 grid grid-cols-3 gap-1"><i className="h-1 bg-slate-200"/><i className="h-1 bg-slate-200"/><i className="h-1 bg-slate-300"/></div></div></div>}
