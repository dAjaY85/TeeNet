'use strict';
/* Optional UI features share the normal command validation and never poll hardware. */
(() => {
  const planNames={off:'Kein Ladeplan aktiv.',pv:'PV hat Vorrang',grid:'Netz ergänzt das Ladeziel',complete:'Ladeziel erreicht',expired:'Endzeit erreicht · Ladeziel nicht vollständig erreicht',paused:'Pausiert · zum Fortsetzen bestätigen',clock:'Warte auf Internetzeit'};
  const eventNames={boot:'Controller gestartet',boot_watchdog:'Neustart nach Zeitüberschreitung',boot_brownout:'Neustart nach Spannungseinbruch',plan_started:'Ladeplan gestartet',plan_cancelled:'Ladeplan beendet',plan_grid:'Ladeplan ergänzt mit Netzstrom',plan_complete:'Ladeziel erreicht',plan_expired:'Endzeit des Ladeplans erreicht',control_changed:'Ladevorgabe geändert',user_stop:'Stopp angefordert',settings_saved:'Einstellungen gespeichert',settings_restored:'Einstellungen wiederhergestellt'};
  reasons.plan_clock='Ladeplan wartet auf eine gültige Internetzeit.';
  let eventsBusy=false,eventRows=[],persistedRows=[],wizardCompleted=false,wizardStep=-1,wizardActive=[],planWasActive=false,wizardGroups=[],wizardOptions=[],huaweiSearching=false,huaweiChecking=false,huaweiDevices=[];
  const steps=[
    {title:'Funktionen auswählen',groups:['equipment-settings'],help:'Grundfunktionen für Manuell und MQTT. Zusatzfunktionen für PV und Erweiterungen.'},
    {title:'WLAN einrichten',groups:['connection-settings'],help:'Heimnetz wählen und Passwort speichern. Bereits verbunden? Weiter.'},
    {title:'Shell-Wallbox',groups:['shell-settings'],help:'Shell suchen und ihre Stromgrenzen übernehmen. Ohne Netzwerk die Werte aus der Shell-Einstellung eintragen.'},
    {title:'Wallbox-Zähler',groups:['meter-settings'],help:'Separaten Zähler am Wallbox-Abgang auswählen und Messwerte prüfen.'},
    {title:'Hausanschluss und PV',groups:['house-settings'],when:f=>!isBasic(f)&&(f.zero_feed_enabled.checked||f.grid_guard_enabled.checked),help:'Hauszähler auswählen und Netzbezug sowie Einspeisung prüfen.'},
    {title:'Smart Home verbinden',groups:['mqtt-settings'],help:'Für ioBroker, Home Assistant oder OpenDTU den gemeinsamen MQTT-Broker eintragen. Sonst MQTT ausschalten.'},
    {title:'OpenDTU-OnBattery',groups:['opendtu-settings'],when:f=>!isBasic(f)&&Number(f.mqtt_input_source.value)===2,help:'Topic-Präfix aus OpenDTU übernehmen. Für die PV-Anzeige das Topic der reinen Solarleistung eintragen.'},
    {title:'Huawei SUN2000',groups:['huawei-settings'],when:f=>!isBasic(f)&&f.huawei_enabled.checked,help:'Wechselrichter suchen, gewünschte Messwerte auswählen und Verbindung prüfen.'},
    {title:'Hausakku einstellen',groups:['battery-settings'],when:f=>f.battery_protect.checked,help:'Entladegrenze und Leistung festlegen. Die Nutzung später in der Übersicht einschalten.'},
    {title:'Preise und Leistung',groups:['consumption-settings'],help:'Spannung und aktuelle Preise eintragen. Bisherige Kosten bleiben erhalten.'},
    {title:'Fahrzeug-Akkuanzeige',groups:['vehicle-settings'],when:f=>f.vehicle_soc_enabled.checked,help:'Fahrzeug-Ladezustand per MQTT senden. Anleitung unten öffnen.'},
    {title:'Externe Kontakte',groups:['hardware-settings'],when:f=>f.external_mode_input_enabled.checked||f.evu_input_enabled.checked,help:'Kontakte prüfen und die EVU-Grenze festlegen.'},
    {title:'Relaisboard',groups:['relay-settings'],when:f=>f.relay_board_enabled.checked,help:'Schaltlogik und Relaisaufgaben wählen. Phasenumschaltung erst nach Anschlussprüfung aktivieren.'},
    {title:'Sicherung, Update und Hilfe',groups:['maintenance'],help:'Einstellungen sichern. Updates und Hilfe findest du später ebenfalls hier.'},
    {title:'Abschlussprüfung',groups:['diagnostic-settings'],help:'Verbindungen prüfen und speichern. Die Ladung anschließend in der Übersicht starten.'}
  ];
  const isBasic=f=>f.basic_mode.value==='true';
  const selectedSteps=()=>{const f=$('config-form').elements;return steps.filter(step=>(!isBasic(f)||!['battery-settings','vehicle-settings','hardware-settings','relay-settings'].some(id=>step.groups.includes(id)))&&(!step.when||step.when(f)));};
  async function huaweiScanStatus(){
    try{
      if(document.hidden)return;
      const result=await api('/api/huawei/scan');huaweiSearching=result.running;huaweiDevices=result.devices||[];
      $('huawei-scan-status').textContent=result.running?`Suche im Heimnetz · ${result.progress} %`:`${huaweiDevices.length} Huawei-Wechselrichter gefunden.${result.partial?' Suche teilweise abgeschlossen.':''}${huaweiDevices.length?'':' Modbus TCP am Smart Dongle aktivieren oder Adresse manuell eintragen.'}`;
      const select=$('huawei-found'),previous=select.value,empty=document.createElement('option');empty.value='';empty.textContent='Wechselrichter auswählen';
      select.replaceChildren(empty,...huaweiDevices.map((d,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${d.model} · ${d.host} · Adresse ${d.unit_id}`;return option;}));select.value=previous;select.hidden=!huaweiDevices.length;
    }catch(error){huaweiSearching=false;$('huawei-scan-status').textContent=error.message;}
    finally{writes();if(huaweiSearching)setTimeout(huaweiScanStatus,2500);}
  }
  $('huawei-scan').addEventListener('click',()=>action(async()=>{await api('/api/huawei/scan',{});huaweiSearching=true;$('huawei-scan-status').textContent='Suche gestartet …';setTimeout(huaweiScanStatus,300);}));
  $('huawei-found').addEventListener('change',()=>{if($('huawei-found').value==='')return;const d=huaweiDevices[Number($('huawei-found').value)];if(!d)return;const f=$('config-form').elements;f.huawei_host.value=d.host;f.huawei_unit_id.value=String(d.unit_id);$('huawei-preview-model').textContent=d.model;$('huawei-preview-state').textContent='Ausgewählt · Messwerte prüfen und anschließend speichern.';});
  async function huaweiPreviewStatus(){
    try{
      if(document.hidden)return;
      const r=await api('/api/huawei/preview');huaweiChecking=r.running;
      if(r.running){$('huawei-preview-state').textContent='Messwerte werden gelesen …';return;}
      const f=$('config-form').elements;if(r.host!==f.huawei_host.value.trim()||r.unit_id!==Number(f.huawei_unit_id.value))return;
      $('huawei-preview-model').textContent=r.model||'Keine Huawei-Verbindung';
      // Null means unsupported or missing, never a measured zero.
      $('huawei-preview-values').textContent=`Haus ${format(r.house_power_w==null?null:r.house_power_w/1000,2)} kW · PV ${format(r.pv_generation_w==null?null:r.pv_generation_w/1000,2)} kW · Akku ${format(r.battery_soc_pct,1)} %`;
      const phases=r.house_current_ok&&Array.isArray(r.house_a)&&r.house_a.length===3&&r.house_a.every(Number.isFinite);
      const phaseText=phases?r.house_a.map((a,i)=>`L${i+1} ${format(a,2)} A`).join(' · '):'Phasenwerte fehlen; bei aktiviertem Hausanschlussschutz gilt maximal 8 kW.';
      const missing=[r.house_power_w==null?'Hauszähler':null,r.pv_generation_w==null?'PV':null,r.battery_soc_pct==null?'Akku':null].filter(Boolean);
      const sampled=new Date().toLocaleTimeString('de-DE');
      $('huawei-preview-state').textContent=!r.connected?'Keine Verbindung. Modbus TCP, IP, Adresse und andere Modbus-Clients prüfen.':`Momentaufnahme ${sampled}. ${missing.length?'Keine gültigen Daten: '+missing.join(', ')+'.':'Alle Messwerte verfügbar.'} ${phaseText} Positiver Hauswert = Netzbezug.`;
    }catch(error){huaweiChecking=false;$('huawei-preview-state').textContent=error.message;}
    finally{writes();if(huaweiChecking)setTimeout(huaweiPreviewStatus,1000);}
  }
  $('huawei-test').addEventListener('click',()=>action(async()=>{const f=$('config-form').elements;await api('/api/huawei/preview',{host:f.huawei_host.value.trim(),unit_id:Number(f.huawei_unit_id.value)});huaweiChecking=true;setTimeout(huaweiPreviewStatus,300);}));
  let shellSearching=false;
  function useShell(device){const f=$('config-form').elements;f.shell_setup_host.value=device.host;f.shell_limits_auto.checked=true;f.grid_limit_a.value=device.grid_limit_a;f.max_charge_a.value=Math.min(16,device.max_charge_a);updateEquipment();toast('Shell-Grenzen übernommen. Einstellungen speichern.');}
  async function pollShellSearch(){
    try{const r=await api('/api/shell/scan');shellSearching=r.running;
      $('shell-search-status').textContent=r.running?`Netzwerksuche · ${r.progress} %`:r.devices.length?`${r.devices.length} Shell-Wallbox gefunden.`:'Keine Shell gefunden. Ohne LAN die beiden Grenzen von Hand eingeben.';
      $('shell-search-results').replaceChildren();for(const device of r.devices){const b=document.createElement('button');b.type='button';b.className='button';b.textContent=`${device.host} · ${device.max_charge_a} A Laden / ${device.grid_limit_a} A Netz`;b.addEventListener('click',()=>useShell(device));$('shell-search-results').append(b);}
      if(!r.running && r.devices.length===1)useShell(r.devices[0]);
    }catch(e){shellSearching=false;$('shell-search-status').textContent=e.message;}
    finally{if(shellSearching)setTimeout(pollShellSearch,1500);$('shell-search').disabled=shellSearching||busy||!online;}
  }
  $('shell-search').addEventListener('click',()=>action(async()=>{await api('/api/shell/scan',{});shellSearching=true;setTimeout(pollShellSearch,300);}));
  function localInput(date){const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(7,0,0,0);
  $('plan-deadline').value=localInput(tomorrow);
  function render(){
    $('plan-panel').hidden=!!state?.basic_mode||!state?.charge_plan_enabled||$('mode').value!=='pv';
    const p=state?.charge_plan||{active:false,phase:'off',target_kwh:0,delivered_kwh:0};
    const when=p.deadline_epoch?new Date(p.deadline_epoch*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    $('plan-status').textContent=(planNames[p.phase]||planNames.off)+(p.target_kwh>0?` · ${format(p.delivered_kwh,1)} / ${format(p.target_kwh,1)} kWh · bis ${when}`:'');
    $('plan-progress').hidden=!p.target_kwh;$('plan-progress').value=p.target_kwh?Math.min(100,p.delivered_kwh/p.target_kwh*100):0;
    $('plan-start').textContent=p.active?'Plan ersetzen':'Plan starten';
    $('plan-start').disabled=!online||busy||!state?.zero_feed_enabled||!!state?.external_mode_input_enabled||!state?.clock_ok;
    $('plan-resume').hidden=!p.active||p.phase!=='paused';$('plan-cancel').hidden=!p.active;
    if(p.active&&!planWasActive)$('plan-panel').open=true;planWasActive=!!p.active;
    if(!p.active&&!state?.zero_feed_enabled)$('plan-status').textContent='Für den Ladeplan einen Hauszähler einrichten.';
    else if(state?.external_mode_input_enabled)$('plan-status').textContent='Ladeplan und Betriebsart-Kontakt sind nicht gleichzeitig nutzbar.';
    const f=$('config-form').elements;
    const auto=f.shell_limits_auto.checked,ready=auto&&state?.shell_limits_auto&&state?.shell_limits_ok;
    $('shell-manual-limits').hidden=!!ready;$('shell-address').hidden=!auto;
    $('shell-limit-summary').textContent=ready?`Aus Shell: ${format(state.max_charge_a,0)} A Laden · ${format(state.grid_limit_a,0)} A Netz`:
      auto?'Noch keine aktuellen Shell-Grenzen. Gespeicherte manuelle Werte gelten.':'Ohne LAN: 16 A Laden und 32 A Netz als Vorgabe. Werte mit der Shell-Einstellung abgleichen.';
    $('shell-search').disabled=shellSearching||busy||!online;
    renderWizardCheck();updateWrites();
  }
  function updateWrites(){const networkBusy=huaweiSearching||huaweiChecking||meterScanning||previewRunning;$('plan-start').disabled=!online||busy||!state?.charge_plan_enabled||!state?.zero_feed_enabled||!!state?.external_mode_input_enabled||!state?.clock_ok;$('huawei-scan').disabled=networkBusy||!online||busy;$('huawei-test').disabled=networkBusy||!online||busy;}
  $('plan-start').addEventListener('click',()=>action(async()=>{
    const kwh=Number($('plan-kwh').value),deadline_epoch=Math.floor(new Date($('plan-deadline').value).getTime()/1000);
    if(!Number.isFinite(kwh)||kwh<.5||kwh>100||!Number.isFinite(deadline_epoch)||deadline_epoch<=Date.now()/1000||deadline_epoch>Date.now()/1000+7*86400)throw new Error('0,5 bis 100 kWh und eine Endzeit innerhalb der nächsten sieben Tage wählen.');
    if(state?.charge_plan?.active&&!window.confirm('Aktiven Ladeplan durch diesen Plan ersetzen?'))return;
    await api('/api/plan',{active:true,kwh,deadline_epoch});dirty=false;await pollStatus();toast('Ladeplan gestartet.');
  }));
  $('plan-resume').addEventListener('click',()=>action(async()=>{await api('/api/plan',{active:true,resume:true});dirty=false;await pollStatus();toast('Ladeplan fortgesetzt.');}));
  $('plan-cancel').addEventListener('click',()=>action(async()=>{await api('/api/plan',{active:false});dirty=false;await pollStatus();toast('Ladeplan beendet · Ladung gestoppt.');}));

  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  $('backup-secrets').addEventListener('change',()=>{$('backup-warning').hidden=!$('backup-secrets').checked;});
  $('backup-download').addEventListener('click',()=>action(async()=>{const data=await api('/api/backup'+($('backup-secrets').checked?'?secrets=1':''),undefined,12000,true);download(data,'TeeNet-Einstellungen.json');toast('Einstellungen gesichert.');}));
  $('restore-upload').addEventListener('click',()=>action(async()=>{
    const file=$('restore-file').files[0];if(!file||file.size>8192)throw new Error('Eine TeeNet-Sicherung bis 8 KB auswählen.');
    let data;try{data=JSON.parse(await file.text());}catch(_){throw new Error('Die Datei enthält keine gültige Sicherung.');}
    if(data.format!=='TeeNet-settings'||data.schema!==1||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw new Error('Eine passende TeeNet-Einstellungssicherung auswählen.');
    if(!window.confirm('Diese Einstellungen wiederherstellen? Die Ladung wird gestoppt. Anschließend neu starten und die Messwerte prüfen.'))return;
    await api('/api/restore',data);await loadConfig();await pollStatus();toast('Wiederhergestellt. Bitte neu starten und Messwerte prüfen.');
  }));
  function renderEvents(){
    const items=[...eventRows,...persistedRows.map(row=>({...row,persisted:true}))].map(row=>{
      const item=document.createElement('li'),title=document.createElement('strong'),time=document.createElement('time'),values=document.createElement('small');
      title.textContent=(row.persisted?'Neustart-Protokoll · ':'')+(eventNames[row.reason]||reasons[row.reason]||row.reason);
      time.textContent=row.epoch?new Date(row.epoch*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):`${Math.floor(row.uptime_s/60)} min nach Start`;
      values.textContent=`Soll ${format(row.target_kw,1)} kW · Wallbox ${format(row.actual_kw,1)} kW · Haus ${format(row.house_kw,1)} kW · Akku ${format(row.battery_pct,0)} %`;
      item.append(time,title,values);return item;
    });
    if(!items.length){const item=document.createElement('li');item.textContent='Noch keine Ereignisse vorhanden.';items.push(item);}
    $('events-list').replaceChildren(...items);
  }
  async function loadEvents(){if(eventsBusy||!online||document.hidden)return;eventsBusy=true;try{const data=await api('/api/events');eventRows=data.events||[];persistedRows=data.persisted_faults||[];renderEvents();}catch(error){toast(error.message,true);}finally{eventsBusy=false;}}
  $('events-refresh').addEventListener('click',loadEvents);
  $('events-export').addEventListener('click',async()=>{await loadEvents();download({format:'TeeNet-events',build_id:state?.build_id,events:eventRows,persisted_faults:persistedRows},'TeeNet-Ereignisse.json');});
  $('event-panel').addEventListener('toggle',()=>{if($('event-panel').open)loadEvents();});

  function layout(){
    if(wizardStep<0)return;
    document.documentElement.dataset.expert=String(!isBasic($('config-form').elements));
    const previous=wizardActive[wizardStep],active=selectedSteps(),position=active.indexOf(previous);
    wizardStep=position>=0?position:Math.min(wizardStep,active.length-1);wizardActive=active;const step=active[wizardStep];
    for(const saved of wizardOptions){const basic=isBasic($('config-form').elements),selected=saved.el.value===saved.el.parentElement.value;saved.el.hidden=basic&&!selected;saved.el.disabled=basic&&!selected;}
    $('wizard-footer').hidden=false;$('wizard-wifi-connect').hidden=!step.groups.includes('connection-settings');
    updateMeterFields();updateEquipment();document.documentElement.dataset.expert=String(!isBasic($('config-form').elements));
    document.querySelectorAll('.settings-group,.equipment-panel').forEach(group=>{group.hidden=!step.groups.includes(group.id);if(!group.hidden)group.open=true;});
    for(const group of document.querySelectorAll('.settings-group:not([hidden]) .advanced:not([hidden])'))if(group.id!=='event-panel'&&group.querySelector('[name]'))group.open=true;
    document.querySelector('.setup-assistant').hidden=true;
    $('wizard-title').textContent='Einrichtungsassistent · '+step.title;$('wizard-help').textContent=step.help;$('wizard-position').textContent=`Schritt ${wizardStep+1} von ${active.length}`;
    $('wizard-back').disabled=wizardStep===0;$('wizard-next').textContent=wizardStep===active.length-1?'Einrichtung speichern':'Weiter';
    renderWizardCheck();
  }
  function renderWizardCheck(){
    if(wizardStep<0)return;
    const step=wizardActive[wizardStep],f=$('config-form').elements,final=!!step?.groups.includes('diagnostic-settings');
    $('wizard-check').hidden=!final;$('wizard-recheck').hidden=!final;if(!final)return;
    const cfg={};for(const name of ['mqtt_enabled','zero_feed_enabled','grid_guard_enabled','battery_protect','huawei_enabled'])cfg[name]=f[name].checked;
    const checks=TeeNetHealth.setupChecks(state||{},cfg),rows=checks.map(check=>{
      const row=document.createElement('div');row.className='setup-check-row';row.dataset.ok=String(check.ok);
      const label=document.createElement('span'),status=document.createElement('b');label.textContent=check.name;status.textContent=check.ok?'Bereit':'Prüfen';row.append(label,status);
      if(!check.ok){const help=document.createElement('small');help.textContent=check.help;row.append(help);}return row;
    });
    const result=document.createElement('p');result.className='footnote';result.textContent=wizardCompleted?(checks.every(c=>c.ok)?'Gespeichert. Alle benötigten Verbindungen sind bereit.':'Gespeichert. Die markierten Verbindungen noch prüfen.'):'Prüfung der gespeicherten Einstellungen. Änderungen noch speichern.';
    $('wizard-check').replaceChildren(...rows,result);
    if(wizardCompleted)$('wizard-next').textContent='Einrichtung beenden';
  }
  $('wizard-recheck').addEventListener('click',()=>action(async()=>{await pollStatus();renderWizardCheck();}));
  $('diagnostic-export').addEventListener('click',()=>action(async()=>{
    await pollStatus();const [settings,events]=await Promise.all([api('/api/config'),api('/api/events')]);
    const packet=TeeNetHealth.sanitize({format:'TeeNet-diagnostics',schema:1,created:new Date().toISOString(),version:state.version,build_id:state.build_id,status:state,settings,events});
    download(packet,`TeeNet-Diagnose-${state.version}.json`);toast('Diagnosepaket gespeichert · ohne Zugangsdaten.');
  }));
  function closeWizard(){wizardStep=-1;wizardActive=[];$('wizard').hidden=true;$('wizard-footer').hidden=true;$('wizard-wifi-connect').hidden=true;$('wizard-recheck').hidden=true;document.querySelector('.setup-assistant').hidden=false;document.documentElement.dataset.wizard='false';for(const saved of wizardGroups){saved.el.hidden=saved.hidden;saved.el.open=saved.open;}for(const saved of wizardOptions){saved.el.hidden=saved.hidden;saved.el.disabled=saved.disabled;}updateExpertMode();updateMeterFields();updateEquipment();}
  $('wizard-wifi-connect').addEventListener('click',()=>action(async()=>{
    const f=$('config-form').elements,data={wifi_ssid:f.wifi_ssid.value.trim()};
    if(!data.wifi_ssid)throw new Error('Heimnetz auswählen.');
    if(f.wifi_password.value)data.wifi_password=f.wifi_password.value;
    if($('clear-wifi-password').checked)data.wifi_password='';
    const result=await api('/api/config',data);Object.assign(configBaseline,data);delete configBaseline.wifi_password;
    if('wifi_password' in data)configBaseline.wifi_password_set=!!data.wifi_password;
    f.wifi_password.value='';$('clear-wifi-password').checked=false;secretPlaceholders();
    if(result.reboot_required){$('wizard-help').textContent='WLAN gespeichert. Nach dem Neustart TeeNet im Heimnetz öffnen und den Assistenten fortsetzen.';await api('/api/reboot',{});toast('Neustart · anschließend im Heimnetz verbinden.');}
    else toast('WLAN gespeichert. Mit „Weiter“ fortfahren.');
  }));
  $('wizard-open').addEventListener('click',()=>{if(!initialized)return;wizardCompleted=false;if(wizardStep<0){wizardGroups=Array.from(document.querySelectorAll('.settings-group,.equipment-panel'),el=>({el,hidden:el.hidden,open:el.open}));wizardOptions=Array.from(document.querySelectorAll('[data-expert-option]'),el=>({el,hidden:el.hidden,disabled:el.disabled}));for(const saved of wizardOptions){const basic=isBasic($('config-form').elements),selected=saved.el.value===saved.el.parentElement.value;saved.el.hidden=basic&&!selected;saved.el.disabled=basic&&!selected;}}wizardStep=0;$('wizard').hidden=false;document.documentElement.dataset.wizard='true';layout();$('wizard').scrollIntoView({block:'start',behavior:'smooth'});});
  $('wizard-close').addEventListener('click',closeWizard);
  $('wizard-back').addEventListener('click',()=>{if(wizardStep>0){wizardCompleted=false;wizardStep--;layout();}});
  $('wizard-next').addEventListener('click',()=>{
    if(wizardCompleted){closeWizard();location.hash='overview';return;}
    const f=$('config-form').elements,active=selectedSteps(),step=active[wizardStep];
    for(const id of step.groups){const group=$(id);for(const field of group.querySelectorAll('input,select')){if(field.type!=='file'&&field.getClientRects().length&&field.willValidate&&!field.checkValidity()){field.reportValidity();return;}}}
    if(step.groups.includes('house-settings')&&f.zero_feed_enabled.checked){const type=f.house_meter_type.value;if(type==='xemex'){toast('Xemex kann den Stromschutz übernehmen; für PV eine Quelle mit Energierichtung wählen.',true);return;}if(['tasmota','shelly_gen2','shelly_em1','em24_tcp'].includes(type)&&!f.house_meter_host.value.trim()){toast('Hauszähler suchen oder seine Adresse eintragen.',true);return;}}
    if(step.groups.includes('huawei-settings')&&f.huawei_enabled.checked&&(!f.huawei_host.value.trim()||!Number.isInteger(Number(f.huawei_unit_id.value)))){toast('Huawei suchen oder Adresse und Modbus-Adresse eintragen.',true);return;}
    if(step.groups.includes('opendtu-settings')&&(!f.opendtu_prefix.value.trim()||(f.pv_display_enabled.checked&&!f.opendtu_pv_topic.value.trim()))){toast('OpenDTU-Präfix und für die PV-Anzeige ein Leistungstopic eintragen.',true);return;}
    if(step.groups.includes('mqtt-settings')&&f.mqtt_enabled.checked&&!/^mqtts?:\/\//.test(f.mqtt_uri.value)){toast('MQTT-Broker eintragen oder MQTT ausschalten.',true);return;}
    if(wizardStep===active.length-1){
      if($('config-form').reportValidity())$('config-form').requestSubmit();
    }else {wizardStep++;layout();$('wizard').scrollIntoView({block:'start',behavior:'smooth'});}
  });
  $('config-form').addEventListener('change',()=>{wizardCompleted=false;layout();});
  window.teennetFeatures={render,layout,updateWrites,networkBusy:()=>huaweiSearching||huaweiChecking,saved:()=>{if(wizardStep===selectedSteps().length-1){wizardCompleted=true;layout();}}};
})();
