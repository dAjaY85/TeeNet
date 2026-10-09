const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('main/dashboard.js','utf8');
const code=source.slice(source.indexOf("// Release display belongs"),source.indexOf("const donateUrl="));
function fixture(result){
 const elements=new Map(),events=new Map();let requests=0;
 const node=id=>{if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',href:'https://example.invalid',open:false,clicks:0,click(){this.clicks++},addEventListener(type,handler){events.set(id+':'+type,handler)}});return elements.get(id)};
 const context={$:node,window:{addEventListener(type,handler){events.set(type,handler)}},fetch:async url=>{requests++;assert.equal(url,'https://api.github.com/repos/stetastic/TeeNet/releases/latest');return{ok:true,json:async()=>result}},AbortController,setTimeout,clearTimeout,Date};
 vm.createContext(context);vm.runInContext(code,context);
 return{context,node,events,requests:()=>requests};
}
(async()=>{
 const f=fixture({tag_name:'v1.15',draft:false,prerelease:false});
 f.events.get('teenet-status')({detail:{version:'1.14'}});
 assert.equal(f.requests(),0,'No GitHub request before opening Update & Help');
 await vm.runInContext('loadLatestRelease()',f.context);
 assert.equal(f.node('available-version').textContent,'TeeNet 1.15 · Update verfügbar');
 await vm.runInContext('loadLatestRelease()',f.context);assert.equal(f.requests(),1,'Cache avoids repeated GitHub requests');
 f.events.get('teenet-status')({detail:{version:'1.16'}});
 assert.equal(f.node('available-version').textContent,'TeeNet 1.15 · installierte Version ist neuer');
 f.events.get('teenet-status')({detail:{version:'1.15'}});
 assert.equal(f.node('available-version').textContent,'TeeNet 1.15 · aktuell');
 const invalid=fixture({tag_name:'<script>',draft:false,prerelease:false});
 await vm.runInContext('loadLatestRelease()',invalid.context);
 assert.equal(invalid.node('available-version').textContent,'Derzeit nicht erreichbar');
 await vm.runInContext('loadLatestRelease()',invalid.context);
 assert.equal(invalid.requests(),1,'Failed lookup backs off instead of repeating on every open');
 const prerelease=fixture({tag_name:'v1.17',draft:false,prerelease:true});
 await vm.runInContext('loadLatestRelease()',prerelease.context);
 assert.equal(prerelease.node('available-version').textContent,'Derzeit nicht erreichbar');
 assert(!fs.readFileSync('main/dashboard.html','utf8').includes('donate-versions'),'No version cards under logo');
 const listener=source.match(/\$\('ota-file-open'\)\.addEventListener\('click',.*?\);\r?\n/)[0];
 vm.runInContext(listener,f.context);f.events.get('ota-file-open:click')();
 assert.equal(f.node('firmware-update').open,true);assert.equal(f.node('local-firmware-update').hidden,false);assert.equal(f.node('ota-file').clicks,1);
 assert.equal(f.requests(),1,'Selecting a file does not trigger an upload or device request');
 console.log('PASS: release display in Update & Help, cache, error backoff, no logo cards and local file chooser');
})().catch(error=>{console.error(error);process.exitCode=1});
