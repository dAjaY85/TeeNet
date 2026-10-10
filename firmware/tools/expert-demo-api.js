/* Local synthetic preview only. Never forwards expert requests to hardware. */
(() => {
 const previous=window.fetch.bind(window),storage='teenet-demo-expert-v1';
 let saved={},active={},wrongUntil=0;
 try{saved=JSON.parse(localStorage.getItem(storage)||'{}');active=JSON.parse(localStorage.getItem(storage+'-active')||'{}');}catch(e){}
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
 const plain=(v,status)=>new Response(v,{status});
 const schemaPromise=previous('/expert-schema.json').then(r=>r.json());
 function valid(schema,values){
  for(const p of schema.parameters){const value=values[p.id]??p.default;if(!Number.isFinite(value)||value<p.min-1e-5||value>p.max+1e-5||Math.abs((value-p.min)/p.step-Math.round((value-p.min)/p.step))>.002)return false;}
  const get=id=>values[id]??schema.parameters.find(p=>p.id===id).default;
  return get('PHASE_STOP_MAX')>get('PHASE_ZERO')&&get('PHASE_DATA_MAX')>get('PHASE_SETTLE')&&get('EVCC_LEASE')>get('EVCC_STATUS_TTL');
 }
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);
  if(url.origin===location.origin && url.pathname==='/api/expert'){
   if(options.method!=='POST')return plain('POST erforderlich.',405);
   let body;try{body=JSON.parse(options.body||'{}');}catch(e){return plain('JSON ungueltig.',400);}
   if(Date.now()<wrongUntil)return plain('Kurz warten und erneut versuchen.',429);
   if(body.pin!=='4040'){wrongUntil=Date.now()+2000;return plain('Experten-Passwort falsch.',403);}
   const schema=await schemaPromise;
   if(!valid(schema,saved)){saved={};active={};}
   const cfg=await (await previous('/api/config')).json();
   if(body.action==='read')return json({parameters:schema.parameters.map(p=>({...p,value:saved[p.id]??p.default,active:active[p.id]??p.default})),defaults:schema.defaults,settings:cfg,pending:schema.parameters.some(p=>(saved[p.id]??p.default)!==(active[p.id]??p.default))});
   const status=await (await previous('/api/status')).json();
   if(status.enabled||status.evcc_enabled||status.phase_switching||!status.meter_ok||(status.actual_a||[0,0,0]).some(a=>a>=1))return plain('Ladung zuerst stoppen; frische Messwerte unter 1 A erforderlich.',409);
   if(body.action==='config')return previous('/api/config',{...options,body:JSON.stringify(body.changes)});
   if(body.action!=='save'&&body.action!=='reset')return plain('Aktion ungueltig.',400);
   const next=body.action==='reset'?{}:{...saved,...body.values};
   if(Object.keys(next).some(key=>!schema.parameters.some(p=>p.id===key))||!valid(schema,next)||(next.MIN_CURRENT??8.7)>cfg.max_charge_a)return plain('Regelparameter und Grenzen pruefen.',400);
   const changed=schema.parameters.some(p=>(next[p.id]??p.default)!==(saved[p.id]??p.default));saved=next;
   try{localStorage.setItem(storage,JSON.stringify(saved));}catch(e){return plain('Speichern fehlgeschlagen.',500);}
   const pending=schema.parameters.some(p=>(saved[p.id]??p.default)!==(active[p.id]??p.default));
   return json({ok:true,reboot_required:!!status.reboot_required||pending,restart_needed:changed&&pending});
  }
  if(url.origin===location.origin && url.pathname==='/api/reboot'&&options.method==='POST'){
   const response=await previous(input,options);if(response.ok){active={...saved};try{localStorage.setItem(storage+'-active',JSON.stringify(active));}catch(e){}}return response;
  }
  const response=await previous(input,options);
  if(url.origin===location.origin && url.pathname==='/api/status'&&response.ok){
   const state=await response.clone().json(),schema=await schemaPromise;
   if(schema.parameters.some(p=>(saved[p.id]??p.default)!==(active[p.id]??p.default)))state.reboot_required=true;
   if(active.MIN_CURRENT)state.min_charge_a=active.MIN_CURRENT;
   return json(state);
  }
  return response;
 };
})();
