const vm=require('vm'),fs=require('fs'),assert=require('assert');
const source=fs.readFileSync('tools/iobroker-teenet-energy.js','utf8').replace('updateEnergy();setInterval(updateEnergy,2000);','');
async function check(values,stale=[]){
 const sent=[],reads=[];
 const ctx=vm.createContext({Date,Math,Number,Promise,Error,String,log(){},sendTo(b,c,m){assert.equal(m.retain,false);sent.push(m)},async getStateAsync(id){reads.push(id);return {val:values[id],ts:Date.now()-(stale.includes(id)?100000:1000),q:0,ack:true};}});
 vm.runInContext(source,ctx);await vm.runInContext('updateEnergy()',ctx);
 assert.deepEqual(reads,['javascript.0.PV Gesamt','javascript.0.Gesamt Enladeleistung','javascript.0.Solis Ladeleistung','parser.0.SPH4600_ChargePower']);
 return Object.fromEntries(sent.map(m=>[m.topic.split('/').pop(),m.message]));
}
(async()=>{
 const values={'javascript.0.PV Gesamt':4974.3,'javascript.0.Gesamt Enladeleistung':0,'javascript.0.Solis Ladeleistung':-3776,'parser.0.SPH4600_ChargePower':0};
 assert.deepEqual(await check(values),{pv_generation_w:'4974.3',battery_charge_w:'3776',battery_discharge_w:'0'});
 assert.deepEqual(await check({...values,'javascript.0.PV Gesamt':-2}),{pv_generation_w:'0',battery_charge_w:'3776',battery_discharge_w:'0'});
 assert.deepEqual(await check({...values,'javascript.0.Gesamt Enladeleistung':1200,'javascript.0.Solis Ladeleistung':0,'parser.0.SPH4600_ChargePower':500}),{pv_generation_w:'4974.3',battery_charge_w:'500',battery_discharge_w:'1200'});
 assert.deepEqual(await check(values,['javascript.0.PV Gesamt']),{pv_generation_valid:'false',battery_charge_w:'3776',battery_discharge_w:'0'});
 assert.deepEqual(await check(values,['javascript.0.Gesamt Enladeleistung']),{pv_generation_w:'4974.3',battery_power_valid:'false'});
 console.log('PASS: PV and charge/discharge display data validated; stale readings cleared; no Pylontech reads');
})().catch(error=>{console.error(error);process.exit(1)});
