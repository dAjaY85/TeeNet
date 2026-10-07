'use strict';

const $=id=>document.getElementById(id);

const format=(value,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';

const reasons={maintenance:'Wartung läuft · Ladung gesperrt.',reboot:'Einstellungen gespeichert · Neustart erforderlich.',unsupported_meter:'Zählerprofil nicht unterstützt · Regelung gesperrt.',house_meter:'Hauszähler fehlt oder ist veraltet · PV-Regelung gesperrt.',commissioning:'Einrichtung läuft · Regelung bis zur Prüfung an der Wallbox gesperrt.',uart:'RS485-Schnittstelle nicht bereit · Regelung gesperrt.',meter:'Kein aktueller Wallbox-Zählerwert · Regelung gesperrt.',feedback:'Wallbox-Strommessung fehlt · Regelung gesperrt.',off:'Laderegelung ausgeschaltet.',pv_stale:'PV-Sollwert veraltet · Regelung gesperrt.',below_minimum:'Sollwert unter Mindeststrom · Stop-Anforderung aktiv.',none:'Regelung aktiv · frische Messwerte vorhanden.'};
Object.assign(reasons,{evu_stop:'EVU-Kontakt aktiv · Ladung gestoppt.',grid_fallback:'Haus-Phasenwerte fehlen oder sind veraltet · Laden bis 8 kW.'});

Object.assign(reasons,{wallbox:'Keine aktuelle Wallbox-Abfrage · PV-Regelung gesperrt.',pv_waiting:'PV wartet auf ausreichend Überschuss.',pv_starting:'Überschuss wird vor dem Start geprüft.',pv_stopping:'Kurze PV-Schwankung wird überbrückt; danach Stop bei weiter fehlendem Überschuss.',pv_cooldown:'PV-Wiederanlaufpause schützt vor häufigem Schalten.'});

let state=null,history={points:[],days:[]},token='',online=false,dirty=false,batterySliderDirty=false,initialized=false,busy=false,configSaving=false,source=0,toastTimer,uploading=false,powerQueued=false,reserveQueued=false,historyBusy=false,statusFailures=0;

reasons.charge_ended='Mehrere Ladeabbrüche in kurzer Zeit. Bitte Ursache prüfen und erneut starten.';
reasons.charge_retry='Ladeabbruch erkannt · automatischer Wiederanlauf nach 30 Sekunden.';

reasons.battery_stale='Akkudaten fehlen oder sind veraltet · Überschussladung pausiert.';

reasons.battery_reserve='Entladegrenze erreicht · warte auf PV-Überschuss.';

let configBaseline={};
let meterScanning=false,meterResults=[];
let scanFamily='',scanTarget='house',previewRunning=false,previewRole='house',previewTurn=0;
const previewKeys={house:'',wallbox:''},previewTimes={house:0,wallbox:0};
function meterFamily(role='house'){return role==='house'&&$('config-form').elements.house_meter_type.value==='tasmota'?'tasmota':'shelly';}
function previewRequest(role='house'){const f=$('config-form').elements;return role==='wallbox'?{role,host:f.wallbox_meter_host.value.trim(),type:f.wallbox_meter_type.value,path:'',unit_id:1}:{role,host:f.house_meter_host.value.trim(),type:f.house_meter_type.value,path:f.house_meter_type.value==='em24_tcp'?'':f.house_power_path.value.trim(),unit_id:f.house_meter_type.value==='em24_tcp'?Number(f.house_address.value):1};}
function scanUi(role){return role==='wallbox'?{button:$('wallbox-meter-scan'),status:$('wallbox-meter-scan-status'),select:$('wallbox-meter-found')}:{button:$('meter-scan'),status:$('meter-scan-status'),select:$('meter-found')};}
function previewUi(role){return role==='wallbox'?{box:$('wallbox-preview'),host:$('wallbox-preview-host'),value:$('wallbox-preview-value'),state:$('wallbox-preview-state')}:{box:$('house-preview'),host:$('house-preview-host'),value:$('house-preview-value'),state:$('house-preview-state')};}

reasons.manual_stop='Sollwert unter Mindeststrom · Stop angefordert.';
reasons.phase_fault='Phasenumschaltung gestört · Ladung gesperrt. Schütz und Rückmeldung prüfen.';
reasons.phase_switching='Phasenwechsel läuft · Ladung wird vor dem Schalten gestoppt.';
reasons.phase_idle='Einphasiger Startversuch ohne Ladestrom beendet · Schütz stromlos. Zum erneuten Versuch Start drücken.';




function toast(text,error=false){$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}

async function api(path,body,timeoutMs=8000,auth=false){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(path,{signal:controller.signal,cache:'no-store',...(auth?{headers:{'X-EMS-Token':token}}:{}),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-EMS-Token':token},body:JSON.stringify(body)})});if(!response.ok)throw new Error((await response.text()).slice(0,240)||`HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer);}}

function writes(){const batteryInactive=$('mode').value!=='pv';document.querySelectorAll('#config-form input, #config-form select, #show-wifi-password, #show-mqtt-password').forEach(el=>el.disabled=!online||!initialized||configSaving);document.querySelectorAll('[data-write]').forEach(b=>b.disabled=!online||busy||(!initialized&&!!b.closest('#config-form'))||((b.id==='battery-toggle'||b.id==='battery-start-toggle')&&(batteryInactive||!state?.battery_protect)));$('current').disabled=!online||busy;$('battery-reserve-slider').disabled=!online||busy||batteryInactive||!state?.battery_protect;for(const role of ['house','wallbox'])scanUi(role).button.disabled=!online||busy||!initialized||meterScanning||previewRunning||!!window.teennetFeatures?.networkBusy();window.teennetFeatures?.updateWrites();if($('config-form').elements.basic_mode?.value==='true')document.querySelectorAll('#house-settings input,#house-settings select,#battery-settings input,#hardware-settings input,#relay-settings select,#huawei-settings input').forEach(el=>el.disabled=true);}

function showConnection(ok){online=ok;writes();}

function diagnostic(label,value){const box=document.createElement('div');box.textContent=label;const strong=document.createElement('b');strong.textContent=value;box.append(strong);return box;}

function controlStatus(s,valid=true){
  const help={meter:'#meter-settings',feedback:'#meter-settings',wallbox:'#meter-settings',uart:'#meter-settings',house_meter:'#house-settings',battery_stale:'#mqtt-settings',battery_reserve:'#battery-settings',phase_fault:'#relay-settings',charge_ended:'#diagnostic-settings',reboot:'#maintenance'};
  const result=(text,kind='normal')=>({text,kind,help:!valid?'#connection-settings':help[s.block_reason]||((s.phase_state==='fehler'||s.charge_stop_latched)?'#diagnostic-settings':null)});
  const wait=(text,seconds,maximum=false)=>text+(Number.isFinite(seconds)&&seconds>0?` · ${maximum?'höchstens noch':'noch'} ${Math.ceil(seconds)} s`:'');
  if(!valid)return result('Verbindung unterbrochen · Status nicht aktuell','fault');
  if(s.phase_state==='fehler')return result('Phasenumschaltung gestört · Ladung gesperrt','fault');
  const phaseWait={current_zero:'Phasenwechsel · warte auf Strom unter 1 A',zero_hold:'Phasenwechsel · stromlose Wartezeit',contact:'Phasenwechsel · warte auf Schütz-Rückmeldung',motion:'Phasenwechsel · Schütz schaltet',settle:'Phasenwechsel · Stabilisierung',fresh_data:'Phasenwechsel · warte auf frische Messwerte'};
  if(s.phase_switch_enabled&&s.phase_state!=='bereit')return result(wait(phaseWait[s.phase_wait_kind]||'Phasenwechsel läuft',s.phase_wait_s,['current_zero','contact','fresh_data'].includes(s.phase_wait_kind)),'waiting');
  if(s.charge_stop_latched)return result('Mehrere Ladeabbrüche · Start gesperrt','fault');
  if(s.charge_retry_s>0)return result(wait('Automatischer Wiederanlauf',s.charge_retry_s),'waiting');
  const actual=s.actual_a||[],charging=s.feedback_ok&&actual.length===3&&actual.every(Number.isFinite)&&Math.max(...actual)>=1;
  if(!s.enabled)return result(charging?'Stopp angefordert · warte auf Ende der Ladung':'Ladung ausgeschaltet',charging?'waiting':'normal');
  if(s.phase_idle_inhibit)return result('Kein Ladestrom · erneuter Start erforderlich','waiting');
  const pvWait={pv_waiting:'Warte auf PV-Überschuss',pv_starting:'PV-Überschuss vor dem Start prüfen',pv_stopping:'PV-Schwankung überbrücken',pv_cooldown:'Pause vor erneutem PV-Start'};
  if(pvWait[s.block_reason])return result(wait(pvWait[s.block_reason],s.pv_wait_s),'waiting');
  if(!['none','grid_fallback'].includes(s.block_reason))return result(reasons[s.block_reason]||'Ladung pausiert','waiting');
  const phases=`${s.charge_phases}-phasig`;
  let text=charging?`Lädt · ${phases}`:`Start angefordert · ${phases} · warte auf Fahrzeug`;
  if(charging&&s.mode==='manual'&&Number.isFinite(s.estimate_w)&&Number.isFinite(s.target_current_a)&&Math.abs(s.estimate_w/1000-s.target_current_a*powerFactor(s.charge_phases))>.3)text=`Ladeleistung wird angepasst · ${phases}`;
  if(s.battery_buffer_active)text+=` · Wolkenpuffer ${Math.ceil(s.battery_buffer_remaining_s/60)} min`;
  if(s.phase_wait_kind==='hold')text+=` · Phasenwechsel frühestens in ${s.phase_wait_s} s`;
  if(s.phase_wait_kind==='candidate')text+=' · '+wait('Phasenwechsel wird vorbereitet',s.phase_wait_s);
  if(s.block_reason==='grid_fallback')text+=' · Haus-Phasenwerte fehlen, maximal 8 kW';
  return result(text,charging?'normal':'waiting');
}

function chargeButtonLabel(s,online,charging){
  if(!online)return 'Verbindung fehlt';
  if(s.charge_stop_latched||s.phase_state==='fehler')return 'Gesperrt · Entsperren';
  if(!s.enabled)return charging?'Stoppt …':'Gestoppt · Starten';
  if(s.phase_switch_enabled&&s.phase_state!=='bereit')return 'Phasenwechsel · Stoppen';
  if(charging)return 'Lädt · Stoppen';
  if(s.mode==='pv')return 'PV wartet · Stoppen';
  return 'Startet · Stoppen';
}

function render(){if(!state)return;const s=state,valid=online;

  $('firmware-version').textContent=s.version?`TeeNet ${s.version}`:'—';



  const energy=s.energy[source],actual=s.actual_a||s.meter_a, measured=valid&&s.feedback_ok&&actual.every(Number.isFinite), peak=measured?Math.max(...actual):null, idle=measured&&peak<1, charging=measured&&!idle;

  let message='';

  if(!['none','off','manual_stop','below_minimum','pv_waiting','pv_starting','pv_cooldown','pv_stopping'].includes(s.block_reason))message=reasons[s.block_reason]||'Status unbekannt.';

  if(s.reboot_required)message='Einstellungen gespeichert. Bitte neu starten.';

  if(!s.storage_ok)message='Speicherfehler: Verbrauch kann nicht zuverlässig gesichert werden.';

  if(s.stop_requested&&charging)message='Stop angefordert. Die Wallbox nimmt noch Strom auf.';

  const status=controlStatus(s,valid);
  if(message&&valid){status.text=message;status.kind='fault';}
  $('control-status').hidden=false;
  $('control-status-text').textContent=status.text;
  $('control-status').dataset.kind=status.kind;
  const locked=s.charge_stop_latched||s.phase_state==='fehler';
  $('unlock-control').hidden=!locked;
  $('unlock-control').disabled=!valid||busy||s.can_unlock===false;
  $('unlock-control').title=s.can_unlock===false?'Zuerst Schützstellung und Messwerte prüfen':'Sperre aufheben · Ladung bleibt gestoppt';

  function lamp(id,ok,label){const el=$(id);el.classList.toggle('ok',valid&&ok);el.classList.toggle('fault',!valid||!ok);el.querySelector('small').textContent=valid&&ok?'OK':'Fehlt';el.title=label;}

  lamp('wallbox-lamp',s.wallbox_ok&&s.last_sent_age_ms!=null&&s.last_sent_age_ms<10000,'Aktuelle Stromabfragen der Wallbox beantwortet');lamp('meter-lamp',s.meter_ok,'Aktuelle Daten vom Wallbox-Stromzähler');

  const watts=s.wallbox_w==null?s.estimate_w:s.wallbox_w;
  const previousWallbox=TeeNetHealth.reading(s,'wallbox',valid);
  const staleWallbox=!measured&&previousWallbox.value!==null;
  $('power').dataset.stale=String(staleWallbox);
  $('status-help').hidden=!status.help;
  $('status-help').href=s.basic_mode&&status.help==='#diagnostic-settings'?'#maintenance':status.help||'#diagnostic-settings';

  $('power').textContent=format(staleWallbox?previousWallbox.value/1000:!valid?null:idle?0:watts==null?null:watts/1000);

  $('power-note').textContent=staleWallbox?`Letzter Messwert · ${TeeNetHealth.ageText(previousWallbox.age)}`:idle?'Keine Ladung':!measured?'Messwerte fehlen':s.wallbox_w==null?'Aus Strommessung geschätzt':'Gemessene Wirkleistung';


  $('charging').textContent=!measured?'Messung fehlt':charging?'Lädt':s.charge_stop_latched?'Start gesperrt':s.charge_retry_s>0?'Wiederanlaufpause':s.enabled&&s.target_current_a>0?'Start angefordert':s.mode==='pv'&&s.enabled?'Wartet auf Leistung':'Bereit';$('charging').classList.toggle('muted-pill',!charging);

  $('today').textContent=format(energy.today_kwh,2);$('total').textContent=format(energy.total_kwh,2);$('coverage').textContent=`${format(energy.today_charging_s/3600,1)} h`;
  const resetDate=String(energy.total_reset_date||'');$('total-reset-date').textContent=resetDate.length===8?`seit ${resetDate.slice(6,8)}.${resetDate.slice(4,6)}.${resetDate.slice(0,4)}`:'seit Aufzeichnung';
  const carSoc=Number.isFinite(s.car_soc_pct)?s.car_soc_pct:null;
  $('car-soc-row').hidden=!s.vehicle_soc_enabled||carSoc===null;
  $('car-soc').textContent=format(carSoc,0);
  document.querySelector('.scene-detail').classList.toggle('has-car-soc',carSoc!==null);

  $('time-note').textContent=s.clock_ok?'':'Uhrzeit wird automatisch über das Internet synchronisiert.';$('time-note').hidden=s.clock_ok;

  $('current').max=powerSteps().length-1;
  if(!dirty){const mode=s.charge_plan_enabled&&s.charge_plan?.active?'pv':s.mode;if(['manual','pv'].includes(mode))$('mode').value=mode;$('current').value=powerStepForCurrent(s.current_a);}

  document.querySelector('.mode-picker').hidden=!!s.basic_mode;
  if(s.basic_mode)$('mode').value='manual';
  $('pv-allocation-status').hidden=!s.pv_allocation_enabled||$('mode').value!=='pv';
  $('pv-allocation-status').textContent=s.pv_allocation_ready?`PV-Priorität: ${['Hausakku zuerst','Auto zuerst','Anteilig aufteilen'][s.pv_priority]}`:'PV-Priorität pausiert · Akkuleistungswerte fehlen';
  document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===$('mode').value)));

  $('manual-current-label').hidden=$('mode').value!=='manual';
  updateDesiredPower();

  const lastSoc=TeeNetHealth.reading(s,'battery',valid),soc=valid&&Number.isFinite(s.battery_soc_pct)?Math.max(0,Math.min(100,s.battery_soc_pct)):lastSoc.value;
  $('battery-soc-label').textContent=!lastSoc.fresh&&soc!==null?`% · ${TeeNetHealth.ageText(lastSoc.age)}`:'% Ladezustand';
  $('battery-soc').dataset.stale=String(!lastSoc.fresh&&soc!==null);$('battery-soc').title=!lastSoc.fresh&&soc!==null?`Letzter Ladezustand · ${TeeNetHealth.ageText(lastSoc.age)}`:'Aktueller Ladezustand';
  $('battery-card').hidden=!s.battery_protect;
  $('house-battery-power').hidden=!s.battery_protect;
  document.querySelector('.home-grid').classList.toggle('battery-hidden',!s.battery_protect);
  const batteryInactive=$('mode').value!=='pv';$('battery-card').dataset.inactive=String(batteryInactive);$('battery-mode-note').hidden=true;
  document.querySelectorAll('.battery-choice').forEach(el=>el.hidden=batteryInactive);writes();
  $('battery-soc').textContent=format(soc,0);
  if(!batterySliderDirty)$('battery-reserve-slider').value=String(Math.round(s.battery_reserve_soc/5)*5);
  updateBatterySlider();
  $('battery-fill').style.width=`${soc??0}%`;
  $('battery-toggle').textContent=!s.battery_protect?'Einrichtung nötig':s.battery_use?'Wolkenpuffer an':'Wolkenpuffer aus';
  $('battery-toggle').setAttribute('aria-pressed',String(!!s.battery_use));
  $('battery-buffer-note').textContent=s.battery_start_use?'Akku-Laden hat Vorrang':s.battery_buffer_active?`Aktiv · noch ${Math.floor(s.battery_buffer_remaining_s/60)}:${String(s.battery_buffer_remaining_s%60).padStart(2,'0')} min`:`Bis ${format(s.battery_cloud_limit_w/1000,1)} kW · maximal 15 Minuten`;
  $('battery-start-toggle').textContent=!s.battery_protect?'Einrichtung nötig':s.battery_start_use?'Akku-Laden an':'Akku-Laden aus';
  $('battery-start-toggle').setAttribute('aria-pressed',String(!!s.battery_start_use));
  $('battery-start-note').textContent=`Bis ${format(s.battery_discharge_limit_w/1000,1)} kW · Hausakku bis ${format(s.battery_reserve_soc,0)} % nutzen`;
  const steps=powerSteps();
  $('target').textContent=$('mode').value==='manual'?(steps.length>1?'':'Keine Ladestufe innerhalb der eingestellten Stromgrenzen verfügbar.'):s.mode==='pv'&&s.enabled?(reasons[s.block_reason]==reasons.none?(charging?'Überschussladung läuft.':'Warte auf Ladeleistung vom Fahrzeug.'):(reasons[s.block_reason]||'Überschussladung')+(s.pv_wait_s>0?` Noch ${s.pv_wait_s} s.`:'')):'Nach dem Start wird verfügbarer PV-Überschuss genutzt.';
  $('target').hidden=!$('target').textContent||!!s.charge_plan?.active;

  $('apply-control').textContent=chargeButtonLabel(s,valid,charging);
  $('apply-control').classList.toggle('primary-button',!!s.enabled);
  $('apply-control').setAttribute('aria-pressed',String(!!s.enabled));
  $('charge-target').textContent=format(valid?s.target_current_a*powerFactor():null,1);

  const maxPower=s.max_charge_a*powerFactor();
  $('charge-power-bar').style.width=`${valid&&!idle&&Number.isFinite(watts)?Math.min(100,watts/1000/maxPower*100):0}%`;
  $('session-prices').textContent=`Netz ${format((s.grid_price_kwh??.25)*100,0)} ct · Solar / Akku ${format((s.solar_price_kwh??.08)*100,0)} ct je kWh`;

  const lastHouse=TeeNetHealth.reading(s,'house',valid),house=valid&&s.house_meter_ok&&Number.isFinite(s.house_power_w)?s.house_power_w:lastHouse.value, direction=house==null?'unknown':house>50?'import':house< -50?'export':'balanced';

  $('house-power').textContent=house==null?'—':`${format(Math.abs(house)/1000,2)} kW`;$('house-caption').textContent={unknown:'Keine aktuellen Hauszählerdaten',import:'Strombezug aus dem Netz',export:'PV speist ins Netz',balanced:'Kein nennenswerter Austausch'}[direction];$('house-card').dataset.direction=lastHouse.fresh?direction:'unknown';$('house-power').dataset.stale=String(!lastHouse.fresh&&house!==null);if(!lastHouse.fresh&&house!==null)$('house-caption').textContent=`Letzter Messwert · ${TeeNetHealth.ageText(lastHouse.age)}`;
  const lastPv=TeeNetHealth.reading(s,'pv',valid),pv=valid&&Number.isFinite(s.pv_generation_w)?s.pv_generation_w:lastPv.value;
  $('pv-power').dataset.stale=String(!lastPv.fresh&&pv!==null);$('pv-reading').querySelector('small').textContent=!lastPv.fresh&&pv!==null?`PV-Erzeugung · ${TeeNetHealth.ageText(lastPv.age)}`:'PV-Erzeugung';
  $('pv-power').textContent=`${format(pv===null?null:pv/1000,2)} kW`;
  $('pv-reading').dataset.fresh=String(pv!==null);$('pv-reading').hidden=!s.pv_display_enabled;
  $('house-card').hidden=!(s.zero_feed_enabled||s.grid_guard_enabled||s.pv_display_enabled||s.battery_protect);
  const charge=valid&&Number.isFinite(s.battery_charge_w)?s.battery_charge_w:null,discharge=valid&&Number.isFinite(s.battery_discharge_w)?s.battery_discharge_w:null;
  const batteryFlow=charge===null||discharge===null?'unknown':charge-discharge>50?'charging':discharge-charge>50?'discharging':'idle';
  $('house-battery-power').dataset.direction=batteryFlow;
  $('house-battery-label').textContent={charging:'Akku lädt',discharging:'Akku entlädt',idle:'Akku bereit',unknown:'Akkuleistung'}[batteryFlow];
  $('house-battery-value').textContent=`${format(batteryFlow==='unknown'?null:Math.max(0,Math.abs(charge-discharge))/1000,2)} kW`;


  const mqttSource=s.mqtt_input_source==='homeassistant'?'Home Assistant':'ioBroker';
  const signal=Number.isFinite(s.wifi_rssi_dbm)?` · ${s.wifi_rssi_dbm} dBm`:'';
  const diagnostics=[diagnostic('Heimnetz',s.wifi_ok?`${s.station_ip}${signal}`:'Nicht verbunden'),diagnostic('Uhrzeit',s.clock_ok?'Synchronisiert':'Warte auf Internetzeit'),diagnostic('MQTT',s.mqtt_ok?`Verbunden · ${mqttSource}`:`Nicht verbunden · ${mqttSource}`),diagnostic('Wallbox',s.wallbox_ok?'Kommunikation OK':'Keine aktuellen Abfragen'),diagnostic('Wallbox-Zähler',s.feedback_ok?'Daten aktuell':'Daten fehlen'),diagnostic('Hauszähler',s.house_meter_ok?'Daten aktuell':s.zero_feed_enabled||s.grid_guard_enabled?'Daten fehlen':'Nicht benötigt'),diagnostic('Speicherung',s.storage_ok?'Bereit':'Fehler'),...(s.huawei_enabled?[diagnostic('Huawei',s.huawei_ok?s.huawei_model:'Keine aktuellen Daten')]:[])];
  if(s.external_mode_input_enabled)diagnostics.push(diagnostic('Betriebsart-Kontakt',s.external_mode_contact?'PV-Überschuss':'Manuell'));
  if(s.evu_input_enabled)diagnostics.push(diagnostic('EVU-Kontakt',s.evu_active?'Aktiv':'Frei'));
  if(s.huawei_enabled&&s.house_meter_type==='huawei')diagnostics.push(diagnostic('Hausströme',s.house_current_ok&&Array.isArray(s.house_a)?s.house_a.map((a,i)=>`L${i+1} ${format(a,2)} A`).join(' · '):'Keine gültige dreiphasige Messung'));
  if(s.grid_guard_enabled)diagnostics.push(diagnostic('Hausanschlussschutz',s.grid_guard_ok?'Messung OK':'Phasenwerte fehlen · maximal 8 kW'));
  $('diagnostics').replaceChildren(...diagnostics);

  window.teennetFeatures?.render();

}

function chartBase(canvas,max,unit){const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const c=canvas.getContext('2d');c.scale(ratio,ratio);const w=rect.width,h=rect.height,left=44,right=12,top=17,bottom=30;const plot={x:left,y:top,w:w-left-right,h:h-top-bottom};c.font='10px system-ui';c.fillStyle='#89968e';c.fillText(unit,3,10);for(let i=0;i<=4;i++){const y=top+plot.h*i/4;c.strokeStyle='#edf1ed';c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillStyle='#88978d';c.fillText(format(max*(1-i/4),max>=10?0:1),3,y+4);}return {c,plot,w,h};}

function drawCharts(){if(!$('statistics').hidden&&!document.hidden)drawPower();}

function drawPower(){const key=source===0?'estimate_w':'wallbox_w',points=history.points||[],values=points.filter(p=>p[key]!==null).map(p=>p[key]/1000);const max=Math.max(1,...values)*1.15,{c,plot}=chartBase($('power-chart'),max,'kW');$('power-empty').hidden=values.length>0;let previous=null;

  points.forEach(p=>{const value=p[key];if(value===null){previous=null;return;}const x=plot.x+plot.w*(1-p.age_min/119),y=plot.y+plot.h*(1-value/1000/max);if(previous&&previous.age-p.age_min===1){c.fillStyle='#2c806717';c.beginPath();c.moveTo(previous.x,plot.y+plot.h);c.lineTo(previous.x,previous.y);c.lineTo(x,y);c.lineTo(x,plot.y+plot.h);c.closePath();c.fill();c.strokeStyle='#438b70';c.lineWidth=2;c.beginPath();c.moveTo(previous.x,previous.y);c.lineTo(x,y);c.stroke();}c.fillStyle='#438b70';c.beginPath();c.arc(x,y,2.3,0,Math.PI*2);c.fill();previous={x,y,age:p.age_min};});

  c.fillStyle='#8b978f';c.textAlign='left';c.fillText('−2 h',plot.x,plot.y+plot.h+22);c.textAlign='center';c.fillText('−1 h',plot.x+plot.w/2,plot.y+plot.h+22);c.textAlign='right';c.fillText('Jetzt',plot.x+plot.w,plot.y+plot.h+22);$('power-chart').title=values.length?`${values.length} Minuten mit Daten. Höchstes Minutenmittel: ${format(Math.max(...values))} kW.`:'Keine Messdaten';}

let sessionOffset=0,sessionCount=0,sessionsBusy=false;
function selectedPeriod(){return $('export-range').value==='year'?$('export-year').value:$('export-month').value;}
function sessionQuery(){return $('export-range').value==='custom'?`from=${encodeURIComponent($('export-from').value)}&to=${encodeURIComponent($('export-to').value)}`:`period=${encodeURIComponent(selectedPeriod())}`;}
function sessionShare(value,total,cost){return `${format(value,2)} kWh · ${format(cost,2)} € · ${format(total?value/total*100:0,0)} %`;}
function renderSessions(data){
  const total=data.grid_kwh+data.solar_kwh+data.unknown_kwh;
  sessionCount=data.count;
  $('session-total').textContent=`${format(total,2)} kWh`;
  $('session-grid').textContent=sessionShare(data.grid_kwh,total,data.grid_cost_eur);
  $('session-solar').textContent=sessionShare(data.solar_kwh,total,data.solar_cost_eur);
  $('session-cost').textContent=`${format(data.cost_eur,2)} €`;
  const rows=data.days.map(s=>{
    const row=document.createElement('tr');
    function cell(main,detail){const td=document.createElement('td');td.dataset.label=['Tag','Energie','Netz','Solar / Akku','Kosten'][row.children.length];const content=document.createElement('span');content.textContent=main;if(detail){const small=document.createElement('small');small.textContent=detail;content.append(small);}td.append(content);row.append(td);}
    const day=String(s.date),dayLabel=day.length===8?`${day.slice(6,8)}.${day.slice(4,6)}.${day.slice(0,4)}`:'Datum unbekannt';
    cell(dayLabel,`${s.sessions} ${s.sessions===1?'Ladesitzung':'Ladesitzungen'} · ${format(s.charging_s/60,0)} Min. Ladezeit${s.active?' · Läuft / kurze Pause':''}`);
    cell(`${format(s.energy_kwh,2)} kWh`);
    cell(`${format(s.grid_kwh,2)} kWh · ${format(s.grid_cost_eur,2)} €`,`${format(s.energy_kwh?s.grid_kwh/s.energy_kwh*100:0,0)} %`);
    cell(`${format(s.solar_kwh,2)} kWh · ${format(s.solar_cost_eur,2)} €`,`${format(s.energy_kwh?s.solar_kwh/s.energy_kwh*100:0,0)} %`);
    cell(`${format(s.cost_eur,2)} €`);
    return row;
  });
  $('session-rows').replaceChildren(...rows);$('session-empty').hidden=data.days.length>0;
  $('session-empty').textContent='Noch keine Ladesitzungen in diesem Zeitraum.';
  $('session-page').textContent=data.count?`${sessionOffset+1}–${Math.min(sessionOffset+20,data.count)} von ${data.count} Tagen`:'0 Tage';
  $('sessions-prev').disabled=sessionOffset===0;$('sessions-next').disabled=sessionOffset+20>=data.count;
}
function clearSessions(message){
  for(const id of ['session-total','session-grid','session-solar','session-cost'])$(id).textContent='—';
  sessionCount=0;$('session-rows').replaceChildren();$('session-empty').hidden=false;$('session-empty').textContent=message;
  $('session-page').textContent='';$('sessions-prev').disabled=$('sessions-next').disabled=true;
}
function validSessionPeriod(){
  if($('export-range').value==='custom')return /^\d{4}-\d{2}-\d{2}$/.test($('export-from').value)&&/^\d{4}-\d{2}-\d{2}$/.test($('export-to').value)&&$('export-from').value<=$('export-to').value;
  return /^\d{4}(-\d{2})?$/.test(selectedPeriod());
}
async function loadSessions(){
  if(sessionsBusy||!online||document.hidden)return;
  const query=sessionQuery(),offset=sessionOffset;
  if(!validSessionPeriod()){clearSessions('Bitte einen gültigen Zeitraum wählen: Von darf nicht nach Bis liegen.');return;}
  lastSessionsAt=Date.now();
  sessionsBusy=true;
  try{const data=await api(`/api/sessions?${query}&offset=${offset}`);if(query===sessionQuery()&&offset===sessionOffset)renderSessions(data);}
  catch(error){if(query===sessionQuery()&&offset===sessionOffset)clearSessions('Sitzungsdaten gerade nicht erreichbar.');}
  finally{sessionsBusy=false;if(query!==sessionQuery()||offset!==sessionOffset)loadSessions();}
}
function changeSessionPeriod(){
  const range=$('export-range').value;$('export-month-label').hidden=range!=='month';$('export-year-label').hidden=range!=='year';$('export-from-label').hidden=$('export-to-label').hidden=range!=='custom';
  sessionOffset=0;const valid=validSessionPeriod();$('session-csv').setAttribute('aria-disabled',String(!valid));$('session-csv').href=`/api/export.csv?${sessionQuery()}`;if(!valid)clearSessions('Bitte einen gültigen Zeitraum wählen: Von darf nicht nach Bis liegen.');else loadSessions();
}
function localDateValue(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
const initialDate=new Date(),initialYear=initialDate.getFullYear();
$('export-month').value=localDateValue(initialDate).slice(0,7);$('export-year').value=initialYear;$('export-from').value=`${initialYear}-01-01`;$('export-to').value=localDateValue(initialDate);
$('session-csv').addEventListener('click',e=>{if(!validSessionPeriod()){e.preventDefault();toast('Bitte einen gültigen Zeitraum wählen.',true);}});
for(const id of ['export-range','export-month','export-year','export-from','export-to'])$(id).addEventListener('change',changeSessionPeriod);
$('sessions-prev').addEventListener('click',()=>{sessionOffset=Math.max(0,sessionOffset-20);loadSessions();});
$('sessions-next').addEventListener('click',()=>{if(sessionOffset+20<sessionCount){sessionOffset+=20;loadSessions();}});
$('session-csv').href=`/api/export.csv?${sessionQuery()}`;

function shellPinChoices(values,field){
  const occupied=new Map();
  if(!['shelly_gen2','shelly_em1'].includes(values.wallbox_meter_type)){occupied.set(4,'Wallbox-Zähler TX');occupied.set(5,'Wallbox-Zähler RX');}
  if(['xemex','sdm630','sdm630mct'].includes(values.house_meter_type)){occupied.set(43,'Hauszähler TX');occupied.set(44,'Hauszähler RX');}
  if(values.external_mode_input_enabled)occupied.set(6,'Betriebsart-Kontakt');
  if(values.evu_input_enabled)occupied.set(7,'EVU-Kontakt');
  if(values.relay_board_enabled){occupied.set(12,'Relais 1');occupied.set(14,'Relais 2');}
  if(values.phase_switch_enabled&&values.phase_feedback_enabled!==false)occupied.set(13,'Schütz-Rückmeldung');
  const other=field==='wallbox_tx_pin'?'wallbox_rx_pin':'wallbox_tx_pin';
  occupied.set(Number(values[other]),field==='wallbox_tx_pin'?'Shell RX':'Shell TX');
  return [1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,38,39,40,41,42,43,44,47].map(pin=>({pin,reason:occupied.get(pin)||''}));
}
function updateShellPins(){
  const f=$('config-form').elements,values={house_meter_type:f.house_meter_type.value,wallbox_meter_type:f.wallbox_meter_type.value};
  for(const key of ['external_mode_input_enabled','evu_input_enabled','relay_board_enabled','phase_switch_enabled','phase_feedback_enabled'])values[key]=f[key].checked;
  values.wallbox_tx_pin=Number(f.wallbox_tx_pin.value||17);values.wallbox_rx_pin=Number(f.wallbox_rx_pin.value||18);
  let conflict=false;
  for(const [name,standard] of [['wallbox_tx_pin',17],['wallbox_rx_pin',18]]){
    const select=f[name],selected=values[name],choices=shellPinChoices(values,name),chosen=choices.find(c=>c.pin===selected);
    if(!chosen)choices.push({pin:selected,reason:'Nicht geeignet'});
    select.replaceChildren(...choices.map(({pin,reason})=>{const option=document.createElement('option');option.value=String(pin);option.textContent=`GPIO ${pin}${reason?' · belegt: '+reason:pin===standard?' · Standard':''}`;option.disabled=!!reason;return option;}));
    select.value=String(selected);const invalid=!chosen||!!chosen.reason;conflict||=invalid;
    select.setCustomValidity(invalid?'Dieser Shell-Pin ist belegt. Bitte einen freien Pin wählen.':'');select.setAttribute('aria-invalid',String(invalid));select.classList.toggle('modified-setting',selected!==standard);
  }
  $('shell-pin-warning').hidden=!conflict;$('shell-pin-warning').textContent=conflict?'Die gewählten Shell-Pins kollidieren mit einer anderen Funktion. Bitte einen freien Pin wählen.':'';
}
$('shell-pins-default').addEventListener('click',()=>{const f=$('config-form').elements;f.wallbox_tx_pin.value='17';f.wallbox_rx_pin.value='18';updateShellPins();toast('TX 17 / RX 18 ausgewählt. Zum Übernehmen speichern.');});

const additionalFeatureFields=['pv_allocation_enabled','zero_feed_enabled','charge_plan_enabled','battery_protect','vehicle_soc_enabled','pv_display_enabled','relay_board_enabled','external_mode_input_enabled','evu_input_enabled','grid_guard_enabled','phase_switch_enabled','huawei_enabled','huawei_battery','huawei_pv'];
function normalizeBasicFields(){
 const f=$('config-form').elements;if(f.basic_mode.value!=='true')return;
 for(const name of additionalFeatureFields)f[name].checked=false;
 f.house_meter_type.value='tasmota';
}
function updateFunctionMode(){
 const basic=$('config-form').elements.basic_mode.value==='true';
 document.documentElement.dataset.basic=String(basic);
 $('additional-functions').hidden=basic;
 document.querySelectorAll('[data-function-mode]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.functionMode==='basic')===basic)));
 $('function-mode-note').textContent=basic?'':'Wähle nur die Zusatzfunktionen, die du nutzen möchtest.';
 $('function-mode-note').hidden=basic;
}
document.querySelectorAll('[data-function-mode]').forEach(button=>button.addEventListener('click',()=>{
 const f=$('config-form').elements;f.basic_mode.value=String(button.dataset.functionMode==='basic');
 normalizeBasicFields();updateExpertMode();$('equipment-settings').open=true;
 f.basic_mode.dispatchEvent(new Event('change',{bubbles:true}));
 writes();
}));

function updateEquipment(){const f=$('config-form').elements,checked=name=>f[name].checked,basic=f.basic_mode.value==='true',expert=!basic;
 updateFunctionMode();
 $('shell-address').hidden=!checked('shell_limits_auto');$('shell-manual-limits').hidden=checked('shell_limits_auto')&&!!state?.shell_limits_ok;
 $('relay-settings').hidden=basic||!checked('relay_board_enabled');
 $('hardware-settings').hidden=basic||(!checked('external_mode_input_enabled')&&!checked('evu_input_enabled'));
 $('mode-contact-settings').hidden=!checked('external_mode_input_enabled');$('evu-contact-settings').hidden=!checked('evu_input_enabled');
 $('mqtt-settings').hidden=false;$('mqtt-connection-details').hidden=!checked('mqtt_enabled');$('vehicle-settings').hidden=basic||!checked('vehicle_soc_enabled');
 $('battery-settings').hidden=basic||!checked('battery_protect');$('phase-settings').hidden=!checked('phase_switch_enabled');$('fixed-phase-setting').hidden=checked('phase_switch_enabled');if(checked('phase_switch_enabled'))f.fixed_charge_phases.value='3';
 f.phase_switch_enabled.closest('label').hidden=!checked('relay_board_enabled');

 $('house-settings').hidden=basic||!(checked('zero_feed_enabled')||checked('grid_guard_enabled'));$('maintenance').hidden=false;$('diagnostic-settings').hidden=!expert;

 $('huawei-settings').hidden=!checked('huawei_enabled');
 if(f.house_meter_type.value==='huawei'){$('house-host-field').hidden=true;}
 const network=['tasmota','shelly_gen2','shelly_em1','em24_tcp'].includes(f.house_meter_type.value);
 const networkWallbox=f.wallbox_meter_type.value.startsWith('shelly_');
 const threePhaseHouse=['xemex','sdm630','sdm630mct','shelly_gen2','huawei','em24_tcp'].includes(f.house_meter_type.value);
 $('house-host-field').hidden=!network;$('house-http-settings').hidden=!expert||f.house_meter_type.value!=='tasmota';
 $('house-shelly-modbus-note').hidden=!f.house_meter_type.value.startsWith('shelly_');
 $('wallbox-network-settings').hidden=!networkWallbox;
 $('meter-bus-settings').hidden=networkWallbox;
 const warnings=[];
 if(!threePhaseHouse)f.grid_guard_enabled.checked=false;
 if(checked('zero_feed_enabled')&&f.house_meter_type.value==='xemex')warnings.push('Dieser Hauszähler liefert nur Ströme. Für PV eine Quelle mit gerichteter Leistung wählen.');
 $('equipment-warning').textContent=warnings.join(' ');$('equipment-warning').hidden=!warnings.length;
 if(!checked('battery_protect')||!checked('zero_feed_enabled'))f.pv_allocation_enabled.checked=false;
 const allocation=checked('pv_allocation_enabled'),priority=Number(f.pv_priority.value);
 $('pv-allocation-settings').hidden=!allocation;
 $('pv-house-priority-field').hidden=priority===1;$('pv-car-priority-field').hidden=priority===0;
 $('pv-house-priority-label').textContent=priority===2?'Anteil Hausakku (kW)':'Für Hausakku reservieren (kW)';
 $('pv-car-priority-label').textContent=priority===2?'Anteil Auto (kW)':'Auto vorrangig bis (kW)';
 $('pv-allocation-note').textContent=priority===0?'Diese PV-Leistung bleibt für den Hausakku; der Rest lädt das Auto. Ab 99 % Hausakku-Ladestand wird die Reserve freigegeben.':priority===1?'Das Auto erhält PV-Leistung bis zu diesem Wert; der Rest bleibt für Hausakku und Einspeisung.':'Die beiden kW-Werte bestimmen das Verhältnis. Beispiel: 2 kW Hausakku und 6 kW Auto ergeben 25 % / 75 % des verfügbaren PV-Überschusses.';
 updateModbus();updateHouseQuery();updateWallboxQuery();updateShellPins();

}

$('config-form').addEventListener('change',e=>{
 const f=$('config-form').elements,name=e.target.name;
 if(name==='phase_switch_enabled'&&f.phase_switch_enabled.checked){f.relay_board_enabled.checked=true;f.relay1_mode.value='3';}
 if(name==='relay_board_enabled'&&!f.relay_board_enabled.checked)f.phase_switch_enabled.checked=false;
 if(name==='mqtt_enabled'&&!f.mqtt_enabled.checked){for(const n of ['vehicle_soc_enabled','homeassistant_enabled'])f[n].checked=false;if(!(f.huawei_enabled.checked&&f.huawei_battery.checked))f.battery_protect.checked=false;if(!(f.huawei_enabled.checked&&f.huawei_pv.checked))f.pv_display_enabled.checked=false;}
 if(name==='house_meter_type'&&f.house_meter_type.value==='huawei')f.huawei_enabled.checked=true;
 if(name==='huawei_enabled'&&!f.huawei_enabled.checked){f.huawei_battery.checked=false;f.huawei_pv.checked=false;if(f.house_meter_type.value==='huawei'){f.house_meter_type.value='tasmota';f.house_meter_host.value='';f.zero_feed_enabled.checked=false;}if(!f.mqtt_enabled.checked){f.battery_protect.checked=false;f.pv_display_enabled.checked=false;}}
 if(name==='huawei_battery'&&f.huawei_battery.checked){f.huawei_enabled.checked=true;f.battery_protect.checked=true;f.zero_feed_enabled.checked=true;f.zero_reserve_w.value='0';}
 if(name==='huawei_pv'&&f.huawei_pv.checked){f.huawei_enabled.checked=true;f.pv_display_enabled.checked=true;}
 if(name==='battery_protect'&&f.battery_protect.checked){if(!(f.huawei_enabled.checked&&f.huawei_battery.checked))f.mqtt_enabled.checked=true;f.zero_feed_enabled.checked=true;if(Number(f.zero_reserve_w.value)>0)f.zero_reserve_w.value='0';}
 if(name==='grid_guard_enabled'&&f.grid_guard_enabled.checked){
  const supported=['xemex','sdm630','sdm630mct','shelly_gen2','huawei','em24_tcp'].includes(f.house_meter_type.value);
  if(!supported){f.grid_guard_enabled.checked=false;toast('Hausanschlussschutz benötigt drei gemessene Phasenströme.',true);}
 }
 if(['vehicle_soc_enabled','homeassistant_enabled'].includes(name)&&f[name].checked)f.mqtt_enabled.checked=true;
 if(name==='pv_display_enabled'&&f[name].checked&&!(f.huawei_enabled.checked&&f.huawei_pv.checked))f.mqtt_enabled.checked=true;
 updateEquipment();
});
async function loadConfig(){const cfg=await api('/api/config');configBaseline=cfg;for(const [name,value] of Object.entries(cfg)){const el=$('config-form').elements.namedItem(name);if(!el)continue;if(el.type==='checkbox')el.checked=value;else if(el.hasAttribute('data-boolean'))el.value=String(!!value);else if(el.type==='number'){const scale=Number(el.dataset.scale)||1;el.value=Number((Number(value)/scale).toFixed(4));}else if(!el.hasAttribute('data-secret'))el.value=value;}batterySliderDirty=false;$('battery-reserve-slider').value=String(Math.round(cfg.battery_reserve_soc/5)*5);updateBatterySlider();updateMeterFields();updateExpertMode();updateEquipment();secretPlaceholders();}
function updateBatterySlider(){$('battery-reserve-view').textContent=`${format(Number($('battery-reserve-slider').value),0)} %`;}
function powerFactor(phases=state?.charge_phases??3){const single=state?.single_power_per_amp_kw;return Number.isFinite(single)?single*phases:.23*phases;}
function phaseForPower(kw){return state?.phase_switch_enabled?(kw>0&&kw<=3.5?1:3):(state?.fixed_charge_phases??3);}
function powerSteps(){
  const factor=powerFactor(3),minimum=(state?.min_charge_a??8)*factor,maximum=(state?.max_charge_a??16)*factor;
  // 5.5 kW is the displayed 8 A operating floor (5.52 kW at 230 V).
  // Permit only display rounding, never lower the commissioned current floor.
  const three=Array.from({length:12},(_,i)=>5.5+i*.5).filter(kw=>kw>=minimum-.05&&kw<=maximum+1e-6);
  const one=(state?.phase_switch_enabled||state?.fixed_charge_phases===1)?Array.from({length:5},(_,i)=>1.5+i*.5).filter(kw=>kw>=(state?.min_charge_a??8)*powerFactor(1)-.05&&kw<=state.max_charge_a*powerFactor(1)+.05):[];
  return [0,...one,...(state?.fixed_charge_phases===1?[]:three)];
}
function selectedPower(){return powerSteps()[Number($('current').value)]??0;}
function powerStepForCurrent(amps){
  const phases=state?.phase_switch_enabled?state.manual_phases:(state?.fixed_charge_phases??3);
  if(!Number.isFinite(amps)||amps<(state?.min_charge_a??8))return 0;
  const steps=powerSteps(),kw=amps*powerFactor(phases);let closest=0;
  for(let i=1;i<steps.length;i++)if(phaseForPower(steps[i])===phases&&(!closest||Math.abs(steps[i]-kw)<Math.abs(steps[closest]-kw)))closest=i;
  return closest;
}
function selectedCurrent(){const kw=selectedPower(),phases=phaseForPower(kw),minimum=state.min_charge_a;return kw===0?0:Math.min(state.max_charge_a,Math.max(minimum,kw/powerFactor(phases)));}
function updateDesiredPower(){const kw=selectedPower(),steps=powerSteps(),phases=phaseForPower(kw);$('desired-power').textContent=kw===0?'Aus':`${format(kw,1)} kW`;$('current').setAttribute('aria-valuetext',kw===0?'Aus':`${format(kw,1)} Kilowatt`);$('power-max').textContent=`${format(steps[steps.length-1],1)} kW`;$('phase-choice').hidden=!state?.phase_switch_enabled||kw===0;$('phase-choice').textContent=`${phases}-phasig`;}

async function action(work){if(busy||!online)return;busy=true;writes();try{await work();}catch(error){toast(error.name==='AbortError'?'Zeitüberschreitung. Verbindung prüfen.':error.message,true);}finally{busy=false;writes();if(powerQueued)queueMicrotask(applyPowerOnRelease);else if(reserveQueued)queueMicrotask(applyReserveOnRelease);}}



function updateMeterFields(){const f=$('config-form').elements,type=f.wallbox_meter_type.value,house=f.house_meter_type.value;$('coil-settings').hidden=type!=='xemex';$('meter-profile-note').textContent=type==='xemex'?'Xemex: hier geprüft · normalerweise 9600 Baud / 8E1.':type==='sdm630'||type==='sdm630mct'?'SDM630-Familie: Register laut Herstellerprotokoll geprüft · vor Ort noch nicht getestet.':type==='sdm230'||type==='sdm120'?'Einphasiger Eastron: Register laut Herstellerprotokoll geprüft; Strom und Leistung werden für symmetrisches dreiphasiges Laden × 3 gerechnet.':type==='shelly_gen2'?'Shelly 3EM: Strom und Wirkleistung werden jede Sekunde per Modbus TCP gelesen. Modbus muss im Shelly aktiviert sein.':type==='shelly_em1'?'Shelly EM: Eine gemessene Phase wird per Modbus TCP gelesen und auf die aktiven Ladephasen hochgerechnet.':'Zählerprofil auswählen.';const serialHouse=['xemex','sdm630','sdm630mct'].includes(house);$('house-bus-settings').hidden=!serialHouse;$('house-unit-field').hidden=!serialHouse&&house!=='em24_tcp';}
function updateExpertMode(){const f=$('config-form').elements,expert=f.basic_mode.value!=='true';document.documentElement.dataset.expert=String(expert);document.querySelectorAll('[data-expert-option]').forEach(option=>{option.hidden=!expert&&option.value!==option.parentElement.value;option.disabled=!expert&&option.value!==option.parentElement.value;});updateEquipment();}

$('config-form').elements.wallbox_meter_type.addEventListener('change',()=>{const f=$('config-form').elements;f.meter_baud.value='9600';f.meter_format.value=f.wallbox_meter_type.value==='xemex'?'1':'0';updateMeterFields();updateEquipment();});
$('config-form').elements.house_meter_type.addEventListener('change',()=>{const f=$('config-form').elements;f.house_power_path.value='';f.house_meter_baud.value='9600';f.house_meter_format.value=f.house_meter_type.value==='xemex'?'1':'0';f.house_address.value='1';updateMeterFields();updateEquipment();});


function modbusDefaults(bus){const f=$('config-form').elements;return bus==='meter'?{xemex_address:1,meter_baud:9600,meter_format:f.wallbox_meter_type.value==='xemex'?1:0}:{house_address:1,house_meter_baud:9600,house_meter_format:f.house_meter_type.value==='xemex'?1:0};}
function updateModbus(){const f=$('config-form').elements;for(const bus of ['meter','house']){let changed=false;for(const [key,value] of Object.entries(modbusDefaults(bus))){const el=f[key],different=Number(el.value)!==value;el.classList.toggle('modified-setting',different);el.setAttribute('aria-description',different?'Vom Modbus-Standard abweichend':'Modbus-Standard');changed||=different;}$(bus+'-modbus-note').hidden=!changed;}}
for(const bus of ['meter','house'])$(bus+'-modbus-reset').addEventListener('click',()=>{const f=$('config-form').elements;for(const [key,value] of Object.entries(modbusDefaults(bus)))f[key].value=String(value);updateModbus();toast('Modbus-Standard eingesetzt. Zum Übernehmen speichern.');});
function updateHouseQuery(){const f=$('config-form').elements,type=f.house_meter_type.value;
 const isTasmota=type==='tasmota',isShelly=type.startsWith('shelly_'),isEm24=type==='em24_tcp',network=isTasmota||isShelly||isEm24;
 const path=isTasmota?'/cm?cmnd=Status%2010':'',override=f.house_power_path.value.trim(),host=f.house_meter_host.value.trim();
 $('meter-discovery').hidden=!(isTasmota||isShelly);$('house-endpoint').hidden=!network;$('house-preview').hidden=!network;
 $('house-em24-note').hidden=!isEm24;
 $('house-host-label').textContent=isEm24?'EM24 IP-Adresse oder Hostname':'Adresse manuell eintragen';f.house_meter_host.placeholder=isEm24?'Zum Beispiel 192.168.178.20 oder em24.local':'Nur nötig, wenn die Suche nichts findet';
 $('meter-scan').textContent=type==='tasmota'?'Tasmota / Wattwächter im Heimnetz suchen':'Shelly-Zähler im Heimnetz suchen';
 if(scanTarget!=='house'||scanFamily!==meterFamily('house')){$('meter-found').hidden=true;$('meter-scan-status').textContent=meterScanning?'Vorherige Suche wird beendet …':'';}
 const key=JSON.stringify(previewRequest('house'));if(key!==previewKeys.house){$('house-preview-value').textContent='—';$('house-preview-state').textContent=host?'Messwert wird geprüft …':'Zähler auswählen oder IP eingeben.';}
 $('house-preview-host').textContent=host;
 $('house-endpoint').textContent=isEm24?(host?'Modbus TCP: '+(host.includes(':')?host:host+':502')+' · Adresse '+f.house_address.value:'EM24-IP-Adresse eingeben.'):isShelly?(host?'Modbus TCP: '+host+':502':'IP-Adresse eingeben oder Zähler suchen.'):(path?(override.startsWith('http://')||override.startsWith('https://')?'Abfrage: '+override:host?'Abfrage: http://'+host+path:'IP-Adresse eingeben oder Zähler suchen.'):'');
 $('house-query-help').textContent=isTasmota?'Automatisch: Wattwächter E320 oder Tasmota ENERGY. Eigene Datenfelder nur bei abweichendem Zählerskript nötig.':type==='shelly_em1'?'Modbus TCP liest die Wirkleistung von Kanal 0. Dieser einzelne Kanal wird am Hausanschluss nicht hochgerechnet.':'Modbus TCP liest Gesamtwirkleistung und alle drei Phasenströme.';
}
function updateWallboxQuery(){const f=$('config-form').elements,network=f.wallbox_meter_type.value.startsWith('shelly_'),host=f.wallbox_meter_host.value.trim(),ui=previewUi('wallbox');
 $('wallbox-network-settings').hidden=!network;if(!network)return;
 if(scanTarget!=='wallbox'||scanFamily!=='shelly'){$('wallbox-meter-found').hidden=true;$('wallbox-meter-scan-status').textContent=meterScanning?'Vorherige Suche wird beendet …':'';}
 const key=JSON.stringify(previewRequest('wallbox'));if(key!==previewKeys.wallbox){ui.value.textContent='—';ui.state.textContent=host?'Messwert wird geprüft …':'Zähler auswählen oder IP eingeben.';}
 ui.host.textContent=host;
}
$('config-form').addEventListener('input',()=>{updateModbus();updateHouseQuery();updateWallboxQuery();});
$('house-query-reset').addEventListener('click',()=>{$('config-form').elements.house_power_path.value='';updateHouseQuery();toast('Automatische Abfrage gewählt. Zum Übernehmen speichern.');});
async function pollMeterScan(){try{if(document.hidden)return;const result=await api('/api/meters/scan',undefined,12000);meterScanning=result.running;meterResults=result.meters||[];scanFamily=result.family;
 const ui=scanUi(scanTarget);if(scanFamily!==meterFamily(scanTarget)){scanTarget==='house'?updateHouseQuery():updateWallboxQuery();return;}
 ui.status.textContent=result.running?`Suche im lokalen Heimnetz · ${result.progress} %`:`${meterResults.length} Zähler gefunden.${result.partial?' Suche vorzeitig beendet.':meterResults.length?'':' Adresse kann auch von Hand eingetragen werden. Bei Shelly muss Modbus TCP aktiviert sein.'}`;
 const select=ui.select,selected=select.value;const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Zähler auswählen';select.replaceChildren(placeholder,...meterResults.map((r,i)=>{const option=document.createElement('option');option.value=String(i);const name=r.type==='tasmota'?'Tasmota / Wattwächter':r.type==='shelly_gen2'?'Shelly 3EM':'Shelly EM · Kanal 0';option.textContent=`${r.host} · ${name} · ${format(r.watts/1000,2)} kW`;return option;}));select.value=selected;select.hidden=!meterResults.length;
 }catch(error){meterScanning=false;scanUi(scanTarget).status.textContent='Suchstatus nicht erreichbar. Bitte erneut versuchen.';}finally{writes();if(meterScanning)setTimeout(pollMeterScan,2500);}}
function startMeterScan(role){action(async()=>{scanTarget=role;const family=meterFamily(role);await api('/api/meters/scan',{family});scanFamily=family;meterScanning=true;scanUi(role).status.textContent='Suche gestartet …';setTimeout(pollMeterScan,500);});}
$('meter-scan').addEventListener('click',()=>startMeterScan('house'));
$('wallbox-meter-scan').addEventListener('click',()=>startMeterScan('wallbox'));
function selectMeter(role){const ui=scanUi(role);if(ui.select.value===''||scanTarget!==role||scanFamily!==meterFamily(role))return;const meter=meterResults[Number(ui.select.value)];if(!meter)return;const f=$('config-form').elements;if(role==='wallbox'){f.wallbox_meter_type.value=meter.type;f.wallbox_meter_host.value=meter.host;}else{f.house_meter_type.value=meter.type;f.house_meter_host.value=meter.host;f.house_power_path.value='';}updateMeterFields();updateEquipment();previewKeys[role]='';previewTimes[role]=0;toast('Zähler ausgewählt. Zum Übernehmen speichern.');}
$('meter-found').addEventListener('change',()=>selectMeter('house'));
$('wallbox-meter-found').addEventListener('change',()=>selectMeter('wallbox'));

async function pollMeterPreview(){
 try{
  if(!online||!initialized||busy||uploading||document.hidden||$('settings').hidden||meterScanning||window.teennetFeatures?.networkBusy())return;
  if(previewRunning){
   const result=await api('/api/meters/preview',undefined,5000);previewRunning=result.running;const role=result.role||previewRole,request=previewRequest(role),key=JSON.stringify(request),ui=previewUi(role);
   if(JSON.stringify({role:result.role,host:result.host,type:result.type,path:result.path,unit_id:result.unit_id??1})!==key)return;
   if(!result.running){ui.value.textContent=result.ok?`${format(Math.abs(result.watts)/1000,2)} kW`:'—';ui.state.textContent=result.ok?role==='wallbox'?`Ladeleistung · vor ${Math.round(result.age_ms/1000)} s gemessen · Vorschau`:`${result.watts<0?'Einspeisung':result.watts>0?'Bezug':'Kein Leistungsfluss'} · vor ${Math.round(result.age_ms/1000)} s gemessen · Vorschau`:request.type==='em24_tcp'?'Kein gültiger EM24-Wert. IP, Port, Modbus-Adresse und Verbindung prüfen.':'Kein gültiger Messwert. Bei Shelly Modbus TCP, Modell, IP und Verbindung prüfen.';}
   return;
  }
  const roles=previewTurn++%2?['wallbox','house']:['house','wallbox'];let selected=null;
  for(const role of roles){const request=previewRequest(role),key=JSON.stringify(request),ui=previewUi(role),open=role==='house'?!$('house-settings').hidden&&$('house-settings').open:!$('meter-settings').hidden&&$('meter-settings').open;if(open&&!ui.box.hidden&&request.host&&(key!==previewKeys[role]||Date.now()-previewTimes[role]>=12000)){selected={role,request,ui};break;}}
  if(!selected)return;const {role,request,ui}=selected,key=JSON.stringify(request);previewRole=role;previewKeys[role]=key;previewTimes[role]=Date.now();ui.value.textContent='—';ui.state.textContent='Messwert wird geprüft …';await api('/api/meters/preview',request,5000);previewRunning=true;
 }catch(error){previewRunning=false;const ui=previewUi(previewRole);ui.value.textContent='—';ui.state.textContent=error.name==='AbortError'?'Zähler antwortet nicht rechtzeitig.':error.message;}
 finally{setTimeout(pollMeterPreview,1500);}
}
setTimeout(pollMeterPreview,1500);

function secretPlaceholders(){for(const name of ['wifi_password','mqtt_password'])$('config-form').elements[name].placeholder=configBaseline[name+'_set']?'•••••••• · gespeichert':'Kein Passwort gespeichert';}
function passwordToggle(buttonName,inputName){$(buttonName).addEventListener('click',()=>{const input=$('config-form').elements[inputName],show=input.type==='password';input.type=show?'text':'password';$(buttonName).textContent=show?'Verbergen':'Anzeigen';$(buttonName).setAttribute('aria-pressed',String(show));});}
passwordToggle('show-mqtt-password','mqtt_password');
passwordToggle('show-wifi-password','wifi_password');

$('wifi-scan').addEventListener('click',()=>action(async()=>{const button=$('wifi-scan');button.textContent='Suche …';try{const result=await api('/api/wifi/scan');const select=$('wifi-networks'),unique=[...new Map((result.networks||[]).map(n=>[n.ssid,n])).values()];const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Netzwerk auswählen …';select.replaceChildren(placeholder,...unique.map(n=>{const option=document.createElement('option');option.value=n.ssid;option.textContent=`${n.ssid} (${n.rssi} dBm)`;return option;}));select.hidden=!unique.length;toast(`${unique.length} WLAN-Netzwerke gefunden.`);}finally{button.textContent='Netzwerke suchen';}}));

$('wifi-networks').addEventListener('change',()=>{if($('wifi-networks').value)$('config-form').elements.wifi_ssid.value=$('wifi-networks').value;});

$('ap-mode').addEventListener('click',()=>{if(!window.confirm('Heimnetz trennen und in den Einrichtungs-AP wechseln? Einstellungen bleiben gespeichert.'))return;action(async()=>{await api('/api/wifi/ap',{});toast('Mit Wallbox-EMS-Setup verbinden und 192.168.4.1 öffnen.');});});

$('battery-toggle').addEventListener('click',()=>action(async()=>{if(!state.battery_protect){toast('Akku-Daten zuerst unter Einstellungen aktivieren.',true);return;}await api('/api/control',{battery_use:!state.battery_use});await pollStatus();}));
$('battery-start-toggle').addEventListener('click',()=>action(async()=>{if(!state.battery_protect){toast('Akku-Daten zuerst unter Einstellungen aktivieren.',true);return;}await api('/api/control',{battery_start_use:!state.battery_start_use});await pollStatus();}));
$('battery-reserve-slider').addEventListener('input',()=>{batterySliderDirty=true;updateBatterySlider();});
function applyReserveOnRelease(){if($('mode').value!=='pv'){reserveQueued=false;return;}if(!reserveQueued||busy||!online)return;action(async()=>{reserveQueued=false;const reserve=Number($('battery-reserve-slider').value);const result=await api('/api/config',{battery_reserve_soc:reserve});if(result.reboot_required)throw new Error('Gespeichert. Bitte neu starten, damit die Grenze gilt.');const field=$('config-form').elements.battery_reserve_soc;if(Number(field.value)===configBaseline.battery_reserve_soc)field.value=String(reserve);configBaseline.battery_reserve_soc=reserve;batterySliderDirty=false;await pollStatus();toast(`Entladegrenze ${reserve} % gespeichert.`);});}
$('battery-reserve-slider').addEventListener('change',()=>{reserveQueued=true;applyReserveOnRelease();});
$('control-form').addEventListener('input',()=>{dirty=true;updateDesiredPower();});
$('current').addEventListener('change',()=>{powerQueued=true;applyPowerOnRelease();});
function applyPowerOnRelease(){if(!powerQueued||busy||!online||$('mode').value!=='manual')return;action(async()=>{do{powerQueued=false;const current=selectedCurrent(),enabled=selectedPower()>0;await api('/api/control',{mode:'manual',current_a:current,manual_phases:phaseForPower(selectedPower()),enabled});}while(powerQueued&&online&&$('mode').value==='manual');dirty=false;await pollStatus();toast('Ladeleistung übernommen.');});}

document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{
  if(busy||!online)return;
  const mode=el.dataset.mode;$('mode').value=mode;if(mode!=='manual')powerQueued=false;
  dirty=true;render();
  // A running session changes policy immediately; only actual phase changes
  // and missing operating prerequisites require a stop in the controller.
  if(state?.enabled&&state.mode!==mode)action(async()=>{try{await api('/api/control',{mode});dirty=false;await pollStatus();toast('Betriebsart übernommen.');}catch(error){dirty=false;render();throw error;}});
}));

$('control-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
  if(state.charge_stop_latched||state.phase_state==='fehler'){
    if(state.can_unlock===false){toast('Zuerst Störung beheben.',true);return;}
    await api('/api/control',{enabled:false,restart:true});toast('Sperre aufgehoben. Zum Laden erneut starten.');
  }else if(state.enabled){await api('/api/control',{enabled:false,mode:'off'});toast('Stop-Anforderung gesendet.');}
  else {
    const actual=state.actual_a||[];
    if(state.feedback_ok&&actual.some(a=>Number.isFinite(a)&&a>=1)){toast('Stopp wird noch ausgeführt.');return;}
    const mode=$('mode').value,enabled=mode!=='manual'||selectedPower()>0;
    await api('/api/control',{mode,current_a:selectedCurrent(),manual_phases:phaseForPower(selectedPower()),enabled,restart:enabled});
    toast(enabled?'Start angefordert.':'Zuerst eine Ladeleistung auswählen.');
  }
  dirty=false;await pollStatus();
});});
$('unlock-control').addEventListener('click',()=>action(async()=>{await api('/api/control',{enabled:false,restart:true});await pollStatus();toast('Sperre aufgehoben. Mit Start laden.');}));


$('config-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const data={};for(const el of $('config-form').elements){if(!el.name||el.type==='submit'||el.disabled)continue;if(el.hasAttribute('data-secret')&&!el.value)continue;const scale=Number(el.dataset.scale)||1;const value=el.type==='number'||el.hasAttribute('data-number')?Number(el.value)*scale:el.type==='checkbox'?el.checked:el.hasAttribute('data-boolean')?el.value==='true':el.value;const baseline=typeof configBaseline[el.name]==='number'?Number(configBaseline[el.name].toFixed(4)):configBaseline[el.name];if(value!==baseline)data[el.name]=value;}if($('clear-wifi-password').checked)data.wifi_password='';configSaving=true;writes();try{const result=await api('/api/config',data);Object.assign(configBaseline,data);for(const name of ['wifi_password','mqtt_password'])if(name in data){configBaseline[name+'_set']=!!data[name];delete configBaseline[name];}secretPlaceholders();await loadConfig();window.teennetFeatures?.saved(result);$('clear-wifi-password').checked=false;$('config-note').textContent=result.reboot_required?'Gespeichert. Für diese Änderungen ist ein Neustart erforderlich.':'Gespeichert und übernommen.';$('config-note').hidden=false;for(const el of $('config-form').elements)if(el.hasAttribute('data-secret'))el.value='';toast(result.reboot_required?'Gespeichert. Bitte neu starten.':'Einstellungen übernommen.');await pollStatus();}finally{configSaving=false;writes();}});});



$('reboot').addEventListener('click',()=>action(async()=>{await api('/api/reboot',{});toast('Zählerstand wird gesichert. Controller startet neu.');initialized=false;dirty=false;showConnection(false);}));

$('factory-reset').addEventListener('click',()=>{if(!window.confirm('Alle WLAN-, MQTT-, Einstellungs- und Statistikdaten löschen?'))return;action(async()=>{await api('/api/factory-reset',{});toast('Werksreset wird ausgeführt.');initialized=false;dirty=false;showConnection(false);});});

$('reset-total').addEventListener('click',()=>{if(!window.confirm('Gesamtzähler auf 0 kWh setzen? Ladesitzungen und Tageswerte bleiben erhalten.'))return;action(async()=>{await api('/api/energy/reset',{});await pollStatus();toast('Gesamtzähler zurückgesetzt.');});});
$('reset-sessions').addEventListener('click',()=>{if(!window.confirm('Alle gespeicherten Ladesitzungen und den CSV-Inhalt löschen?'))return;action(async()=>{await api('/api/sessions/reset',{});sessionOffset=0;await loadSessions();toast('Ladesitzungen gelöscht.');});});

let selectedFirmware=null;
$('ota-file').addEventListener('change',async()=>{
  const file=$('ota-file').files[0];selectedFirmware=null;$('firmware-selected').textContent='Prüfe Datei …';
  try{const info=await TeeNetFirmware.inspect(file,state?.ota_max_bytes);if($('ota-file').files[0]!==file)return;selectedFirmware={file,info};$('firmware-selected').textContent=`TeeNet ${info.version}`;$('ota-status').textContent=info.integrity?'Gerätetyp, Projekt und Prüfsumme passen.':'Gerätetyp und Projekt passen; der ESP prüft die vollständige Datei.';}
  catch(error){if($('ota-file').files[0]!==file)return;$('firmware-selected').textContent='Datei nicht passend';$('ota-status').textContent=error.message;}
});
$('ota-upload').addEventListener('click',()=>action(async()=>{
  const file=$('ota-file').files[0],info=await TeeNetFirmware.inspect(file,state?.ota_max_bytes);
  if(!window.confirm(`TeeNet ${info.version} installieren? Die Ladung wird gestoppt.`))return;
  uploading=true;$('ota-status').textContent='Ladung stoppen …';
  try{
    if(state.enabled)await api('/api/control',{enabled:false,mode:'off'});
    const stoppedBy=Date.now()+60000;
    while(true){await pollStatus();const a=state.actual_a||[];if(!state.enabled&&(!state.feedback_ok||a.length===3&&a.every(v=>Number.isFinite(v)&&v<1)))break;if(Date.now()>stoppedBy)throw Error('Ladestopp noch nicht bestätigt. Erst Ende der Ladung abwarten.');$('ota-status').textContent='Warte auf Ende der Ladung …';await new Promise(resolve=>setTimeout(resolve,1000));}
    const oldBuild=state.build_id;
    await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST','/api/ota');xhr.timeout=200000;xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-EMS-Token',token);
      xhr.upload.onprogress=e=>{if(e.lengthComputable)$('ota-status').textContent=`Übertragung: ${Math.round(e.loaded/e.total*100)} % · danach Dateiprüfung`;};
      xhr.onload=()=>xhr.status===200?resolve():reject(new Error(xhr.responseText.slice(0,240)||'Update fehlgeschlagen'));
      xhr.onerror=()=>reject(new Error('Verbindung beim Update unterbrochen. Bisherige Version und Verbindung prüfen.'));
      xhr.ontimeout=()=>reject(new Error('Zeitüberschreitung beim Update.'));xhr.send(file);
    });
    TeeNetFirmware.remember(info,oldBuild);$('ota-status').textContent='Datei geprüft. Warte auf Neustart und Bestätigung …';initialized=false;showConnection(false);schedulePoll(2000);
  }catch(error){$('ota-status').textContent=error.message;throw error;}finally{uploading=false;}
}));

let statusPromise=null,loadedBuild='';
async function pollStatus(){if(statusPromise)return statusPromise;statusPromise=(async()=>{const next=await api('/api/status',undefined,12000);if(loadedBuild&&next.build_id&&loadedBuild!==next.build_id){window.location.reload();return;}loadedBuild=next.build_id||loadedBuild;window.TeeNetHealth?.observe(next);state=next;token=state.token;statusFailures=0;showConnection(true);render();const updateMessage=window.TeeNetFirmware?.checkBoot(next);if(updateMessage){$('ota-status').textContent=updateMessage;toast(updateMessage);}})();try{return await statusPromise;}finally{statusPromise=null;}}

async function loadHistory(){if(historyBusy||!online||document.hidden)return;historyBusy=true;lastHistoryAt=Date.now();try{history=await api('/api/history',undefined,15000);drawCharts();}catch(error){}finally{historyBusy=false;}}

let lastHistoryAt=-Infinity,lastSessionsAt=-Infinity;

let pollTimer=null,pollRunning=false;
function pollDelay(){
  if(!state||state.enabled!==false||!state.feedback_ok||!Array.isArray(state.actual_a)||state.actual_a.some(a=>!Number.isFinite(a)||a>=1))return 2000;
  return !$('settings').hidden?5000:10000;
}
function schedulePoll(delay=2000){clearTimeout(pollTimer);if(!document.hidden)pollTimer=setTimeout(poll,delay);}
async function poll(){if(pollRunning||document.hidden)return;pollRunning=true;try{if(busy||uploading)return;await pollStatus();if(!initialized){await loadConfig();initialized=true;writes();}if(!$('statistics').hidden){const now=Date.now();if(now-lastHistoryAt>=60000)loadHistory();if(now-lastSessionsAt>=30000)loadSessions();}}catch(error){if(++statusFailures>=2){showConnection(false);render();}}finally{pollRunning=false;schedulePoll(statusFailures?Math.min(30000,2000*2**Math.min(statusFailures,4)):pollDelay());}}
document.addEventListener('visibilitychange',()=>{clearTimeout(pollTimer);if(!document.hidden){lastHistoryAt=lastSessionsAt=-Infinity;schedulePoll(0);}});

window.addEventListener('resize',drawCharts);

function showPage(){const anchor=location.hash.slice(1),groups=['setup-assistant','equipment-settings','huawei-settings','relay-settings','connection-settings','meter-settings','house-settings','hardware-settings','consumption-settings','mqtt-settings','vehicle-settings','diagnostic-settings','maintenance'];const page=anchor==='statistics'?'statistics':anchor==='settings'||groups.includes(anchor)?'settings':'overview';for(const id of ['overview','statistics','settings'])$(id).hidden=id!==page;document.querySelectorAll('nav a').forEach(a=>{const active=a.getAttribute('href')==='#'+page;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});if(page==='statistics'&&initialized){loadHistory();loadSessions();}if(groups.includes(anchor)){for(let section=$(anchor);section;section=section.parentElement)if(section.tagName==='DETAILS')section.open=true;}requestAnimationFrame(()=>{drawCharts();if(groups.includes(anchor))$(anchor).scrollIntoView({block:'start'});else window.scrollTo(0,0);});}

const donateUrl=$('donate-link').href;
let qrLoading=false;
function showDonate(){
  $('donate-dialog').showModal();
  if(qrLoading||$('donate-qr').querySelector('svg'))return;
  qrLoading=true;
  const script=document.createElement('script');script.src='/qrcode.js';
  script.onload=()=>{try{const qr=qrcode(0,'M');qr.addData(donateUrl);qr.make();$('donate-qr').innerHTML=qr.createSvgTag({cellSize:5,margin:4,scalable:true});}catch(error){$('donate-qr').textContent='QR-Code konnte nicht erzeugt werden.';}finally{qrLoading=false;}};
  script.onerror=()=>{qrLoading=false;$('donate-qr').textContent='QR-Code konnte nicht geladen werden.';};
  document.head.append(script);
}
$('donate-open').addEventListener('click',showDonate);
$('donate-close').addEventListener('click',()=>$('donate-dialog').close());
$('donate-dialog').addEventListener('click',e=>{if(e.target===$('donate-dialog'))$('donate-dialog').close();});

window.addEventListener('hashchange',showPage);

showPage();writes();poll();
