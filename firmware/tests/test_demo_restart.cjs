const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function demo(){
  const location={origin:'http://demo.local',search:''};
  const window={location,fetch(){throw Error('Unexpected real network');}};
  const context={window,location,URL,URLSearchParams,Response,Date,Math,Number,String,Map,JSON,document:{addEventListener(){}},localStorage:{getItem:key=>key==='teenet-demo-terms'?'2026-10-09.2':null,setItem(){}}};
  vm.runInNewContext(fs.readFileSync('preview/demo-api.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('tools/evcc-demo-api.js','utf8'),context);
  return {read:async path=>(await window.fetch(path)).json(),post:async(path,data)=>(await window.fetch(path,{method:'POST',body:JSON.stringify(data)})).json()};
}
(async()=>{
  for(const change of [{wifi_ssid:'Another demo network'},{wifi_password:'demo-only-password'},{mqtt_uri:'mqtt://another.demo:1883'},{mqtt_password:'demo-only-password'},{meter_baud:19200},{relay_board_enabled:true},{evu_input_enabled:true},{shell_rs485_interface:1,shell_rs485_host:'192.0.2.20:8899'},{mqtt_input_source:2}]){
    const d=demo();assert.equal((await d.post('/api/config',change)).reboot_required,true);
    const status=await d.read('/api/status');assert.equal(status.reboot_required,true);assert.equal(status.enabled,false);
    const live=await d.post('/api/config',{price_kwh:.3});assert.equal(live.reboot_required,true);assert.equal(live.restart_needed,false);assert.equal(live.applied,true);
    await d.post('/api/reboot',{});assert.equal((await d.read('/api/status')).reboot_required,false);
    assert.equal((await d.post('/api/config',change)).reboot_required,false);
  }
  for(const change of [{price_kwh:.3},{solar_price_kwh:.09},{battery_reserve_soc:50},{battery_cloud_limit_w:3000},{pv_priority:1},{vehicle_soc_enabled:false},{charge_plan_enabled:true},{zero_feed_enabled:false},{zero_reserve_w:-100},{grid_limit_a:35},{max_charge_a:15},{grid_guard_enabled:true},{evu_limit_a:12},{house_meter_host:'meter.demo.local'},{house_power_path:'StatusSNS.Power'},{huawei_enabled:true},{huawei_host:'inverter.demo.local'},{huawei_unit_id:2},{huawei_battery:true},{huawei_pv:true},{shell_limits_auto:true},{shell_setup_host:'shell.demo.local'}]){
    const d=demo();assert.equal((await d.post('/api/config',change)).reboot_required,false);assert.equal((await d.read('/api/status')).enabled,true);
  }
  const d=demo();await d.post('/api/config',{mqtt_input_source:2});await d.post('/api/reboot',{});
  assert.equal((await d.post('/api/config',{opendtu_prefix:'another-dtu'})).reboot_required,true);
  const profile=demo();await profile.post('/api/config',{basic_mode:true,zero_feed_enabled:false});
  await profile.post('/api/reboot',{});
  assert.equal((await profile.post('/api/config',{basic_mode:false})).reboot_required,false,'showing extra functions alone needs no restart');
  console.log('PASS: demo WLAN/password and connection restarts, live prices/battery, pending restart and unchanged saves');
})().catch(error=>{console.error(error);process.exit(1);});
