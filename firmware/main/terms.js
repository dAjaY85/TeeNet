(()=>{
 const dialog=document.getElementById('terms-dialog'),confirm=document.getElementById('terms-confirm'),accept=document.getElementById('terms-accept'),message=document.getElementById('terms-message');
 let pending=false,revision='';
 function update(){
  if(!state||typeof state.terms_accepted!=='boolean')return;
  revision=state.terms_revision;
  if(!state.terms_accepted){
   if(!dialog.open)dialog.showModal();
   document.querySelectorAll('[data-write],#config-form input,#config-form select,#apply-control,#current,#battery-reserve-slider,#evcc-save').forEach(el=>el.disabled=true);
  }else if(dialog.open)dialog.close();
  accept.disabled=pending||!online||!confirm.checked||!revision;
 }
 dialog.addEventListener('cancel',event=>event.preventDefault());
 confirm.addEventListener('change',update);
 accept.addEventListener('click',async()=>{
  if(pending||!confirm.checked||!revision||!online)return;
  pending=true;update();message.textContent='Bestätigung wird gespeichert …';
  try{await api('/api/terms',{accepted:true,revision});await pollStatus();writes();message.textContent='';}
  catch(error){message.textContent=error.message;}
  finally{pending=false;update();}
 });
 window.addEventListener('teenet-status',update);window.teenetTerms={updateWrites:update};
})();
