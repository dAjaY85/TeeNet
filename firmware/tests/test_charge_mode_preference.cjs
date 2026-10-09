const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main/dashboard.js','utf8');
const helpers=source.slice(source.indexOf('let preferredChargeMode='),source.indexOf("reasons.charge_ended="));
const listeners=source.slice(source.indexOf("document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click'"),source.indexOf("$('control-form').addEventListener('submit'"));
assert(helpers.includes('function displayedChargeMode(')&&listeners.includes('rememberChargeMode(mode)'));
const storage=new Map();
function page(options={}){
  const mode={value:'manual'},buttons={},requests=[],tasks=[];
  const context=vm.createContext({
    localStorage:options.blocked?{getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}}:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    state:{enabled:false,mode:'off',zero_feed_enabled:true,...options.state},busy:false,online:true,dirty:false,powerQueued:false,
    $:()=>mode,document:{querySelectorAll:()=>['manual','pv'].map(value=>({dataset:{mode:value},addEventListener:(event,fn)=>buttons[value]=fn}))},
    api:async(path,body)=>{requests.push({path,body});if(options.fail)throw Error('Unavailable');context.state.mode=body.mode;},
    pollStatus:async()=>context.render(),toast:()=>{},action:fn=>tasks.push(fn())
  });
  vm.runInContext(helpers,context);
  context.render=()=>{if(!context.dirty)mode.value=context.displayedChargeMode(context.state);};
  vm.runInContext(listeners,context);context.render();
  return {context,mode,buttons,requests,tasks};
}
(async()=>{
  let p=page();assert.equal(p.mode.value,'manual');
  p.buttons.pv();assert.equal(p.mode.value,'pv');assert.equal(p.context.state.enabled,false);
  assert.equal(p.requests.length,0,'choosing a stopped mode must not send a control or start command');
  assert.equal(p.context.dirty,false,'a saved browser preference is not an outstanding device change');
  p=page();assert.equal(p.mode.value,'pv','reopening restores the next stopped mode');
  p.buttons.manual();assert.equal(page().mode.value,'manual');
  storage.set('teennet-charge-mode','pv');
  assert.equal(page({state:{enabled:true,mode:'manual'}}).mode.value,'manual','running device mode is authoritative');
  assert.equal(page({state:{basic_mode:true}}).mode.value,'manual');
  p=page({state:{zero_feed_enabled:false}});p.buttons.pv();assert.equal(p.mode.value,'manual');assert.equal(p.requests.length,0);
  assert.equal(page({state:{charge_plan_enabled:true,charge_plan:{active:true}}}).mode.value,'pv');
  assert.equal(page({state:{external_mode_input_enabled:true,external_mode_contact:false}}).mode.value,'manual');
  assert.equal(page({state:{external_mode_input_enabled:true,external_mode_contact:true}}).mode.value,'pv');
  storage.set('teennet-charge-mode','invalid');assert.equal(page().mode.value,'manual');
  p=page({blocked:true});p.buttons.pv();assert.equal(p.mode.value,'pv','storage restrictions must not break local operation');
  storage.set('teennet-charge-mode','manual');
  p=page({state:{enabled:true,mode:'manual'}});p.buttons.pv();await Promise.all(p.tasks);
  assert.deepEqual(p.requests.map(r=>JSON.parse(JSON.stringify(r))),[{path:'/api/control',body:{mode:'pv'}}]);
  assert.equal(p.mode.value,'pv');assert.equal(page().mode.value,'pv');
  storage.set('teennet-charge-mode','manual');
  p=page({state:{enabled:true,mode:'manual'},fail:true});p.buttons.pv();await assert.rejects(p.tasks[0],/Unavailable/);
  assert.equal(p.mode.value,'manual','failed running-mode changes return to the device mode');
  assert.equal(page().mode.value,'manual','a failed command must not replace the preference');
  console.log('PASS: stopped PV selection survives reopen without a command; active modes, feature gates and failed commands remain authoritative');
})().catch(error=>{console.error(error);process.exitCode=1;});
