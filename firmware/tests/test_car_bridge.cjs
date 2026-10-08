const vm=require('vm'),fs=require('fs'),assert=require('assert');
const source=fs.readFileSync('tools/iobroker-teenet-car.js','utf8').replace('updateCarSoc();setInterval(updateCarSoc,60000);','');
let state={val:34,ts:Date.now(),ack:true,q:0};
const sent=[];
const ctx=vm.createContext({Date,Math,Number,Promise,Error,String,log(){},sendTo(adapter,method,message){
  assert.equal(adapter,'mqtt.0');assert.equal(method,'sendMessage2Client');assert.equal(message.retain,false);sent.push(message);
},async getStateAsync(id){assert.equal(id,'mercedesme.0.W1NBM1DB5VN026661.state.soc.intValue');return state;}});
vm.runInContext(source,ctx);
async function update(){await vm.runInContext('updateCarSoc()',ctx);}
(async()=>{
  await update();assert.equal(sent.at(-1).topic,'wallbox-ems/input/car_soc_pct');assert.equal(sent.at(-1).message,'34');
  await update();assert.equal(sent.length,1,'unchanged SOC should not be resent immediately');
  state={...state,val:35};await update();assert.equal(sent.at(-1).message,'35');
  state={...state,ts:Date.now()-21*60*1000};await update();assert.equal(sent.at(-1).topic,'wallbox-ems/input/car_soc_valid');assert.equal(sent.at(-1).message,'false');
  const count=sent.length;await update();assert.equal(sent.length,count,'stale state should not flood MQTT');
  state={...state,val:36,ts:Date.now()};await update();assert.equal(sent.at(-1).message,'36');
  console.log('PASS: GLB SOC publishes changes, suppresses repeats, invalidates stale data and recovers');
})().catch(error=>{console.error(error);process.exit(1)});
