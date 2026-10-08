const fs=require('fs'),vm=require('vm'),assert=require('assert');
const listeners=new Map(),created=[];const sent=[];
vm.runInNewContext(fs.readFileSync('tools/iobroker-teenet-current.js','utf8'),{
 on:(f,cb)=>{listeners.set(f.id,{filter:f,listener:cb})},createState:(...args)=>created.push(args),sendTo:(...args)=>sent.push(args),log:()=>{},Date,Number,String,Math
});
assert.strictEqual(sent.length,0);
assert.strictEqual(listeners.size,3);assert.strictEqual(created.length,2);
const current=listeners.get('mqtt.0.wallbox-ems.sensor.target_current_a');assert.strictEqual(current.filter.ack,false);
const listener=current.listener;
const event=(val,ack=false,ts=Date.now())=>({state:{val,ack,ts}});
listener(event(8.1,true));listener(event(8.1,false,Date.now()-60000));
listener(event(8.1,false,Date.now()+60000));listener(event('NaN'));listener(event('8junk'));listener(event(-1));listener(event(64));
assert.strictEqual(sent.length,0);
listener(event('8,1'));listener(event(0));
assert.deepStrictEqual(sent.map(x=>x[2].message),['8.1','0']);
assert(sent.every(x=>x[0]==='mqtt.0'&&x[1]==='sendMessage2Client'&&x[2].topic==='wallbox-ems/command/current_a'&&x[2].retain===false));
const power=listeners.get('javascript.0.TeeNet_Wunschleistung_kW').listener;
const mode=listeners.get('javascript.0.TeeNet_Betriebsart').listener;
power(event(5.7));power(event(5.5,true));power(event(11.5));power(event(5.5,false,Date.now()-20000));
mode(event('auto'));mode(event('pv',true));
assert.strictEqual(sent.length,2);
power(event('5,5'));power(event(11));power(event(0));mode(event('pv'));mode(event('manual'));mode(event('off'));
assert.deepStrictEqual(sent.slice(2).map(x=>[x[2].topic,x[2].message]),[
 ['wallbox-ems/command/power_kw','5.5'],['wallbox-ems/command/power_kw','11'],['wallbox-ems/command/power_kw','0'],
 ['wallbox-ems/command/mode','pv'],['wallbox-ems/command/mode','manual'],['wallbox-ems/command/mode','off']]);
assert(sent.every(x=>x[2].retain===false));
console.log('PASS: deliberate ioBroker current, power and mode writes; no startup replay, telemetry loop or retained commands');
