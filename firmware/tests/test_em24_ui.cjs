const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('main/dashboard.js','utf8');
function part(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
const fields={wallbox_meter_type:{value:'shelly_gen2'},wallbox_meter_host:{value:'wallbox.demo'},house_meter_type:{value:'em24_tcp'},house_meter_host:{value:'192.168.178.20:1502'},house_address:{value:'7'},house_power_path:{value:'old.path'}};
const nodes={'config-form':{elements:fields}};
function $(id){return nodes[id]??=(id.endsWith('select')?{value:''}:{});}
const ctx=vm.createContext({$,Number,Map,JSON,scanTarget:'house',scanFamily:'',meterScanning:false,previewKeys:{house:'',wallbox:''}});
vm.runInContext(part('function previewRequest(','function scanUi(')+part('function shellPinChoices(','function updateShellPins(')+part('function updateHouseQuery(','function updateWallboxQuery(')+part('function updateMeterFields(','function updateExpertMode('),ctx);
ctx.meterFamily=()=> 'shelly';
vm.runInContext('updateHouseQuery();updateMeterFields()',ctx);
assert.equal(nodes['meter-discovery'].hidden,true,'Do not offer Shelly discovery for an EM24');
assert.equal(nodes['house-preview'].hidden,false);assert.equal(nodes['house-em24-note'].hidden,false);
assert.equal(nodes['house-bus-settings'].hidden,true);assert.equal(nodes['house-unit-field'].hidden,false);
assert.match(nodes['house-endpoint'].textContent,/1502.*7/);
const request=JSON.parse(vm.runInContext('JSON.stringify(previewRequest())',ctx));
assert.equal(request.unit_id,7);assert.equal(request.path,'');
ctx.values={house_meter_type:'em24_tcp',wallbox_meter_type:'shelly_gen2',wallbox_tx_pin:6,wallbox_rx_pin:18};
const choices=JSON.parse(vm.runInContext("JSON.stringify(shellPinChoices(values,'wallbox_rx_pin'))",ctx));
assert.equal(choices.find(x=>x.pin===5).reason,'');assert.equal(choices.find(x=>x.pin===6).reason,'Shell TX');
ctx.values.wallbox_meter_type='xemex';
assert.match(vm.runInContext("shellPinChoices(values,'wallbox_rx_pin').find(x=>x.pin===5).reason",ctx),/Zähler/);
fields.house_meter_type.value='tasmota';vm.runInContext('updateHouseQuery();updateMeterFields()',ctx);
assert.equal(nodes['house-em24-note'].hidden,true);assert.equal(nodes['house-unit-field'].hidden,true);
assert.equal(nodes['meter-discovery'].hidden,false);
const html=fs.readFileSync('main/dashboard.html','utf8');
assert.equal((html.match(/name="house_address"/g)||[]).length,1);
assert(html.includes('value="em24_tcp"'));assert(html.includes('id="house-em24-note"'));
console.log('PASS: EM24 model, TCP unit/port preview, contextual fields, discovery visibility and GPIO5 choices');
