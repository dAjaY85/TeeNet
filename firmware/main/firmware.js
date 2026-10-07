'use strict';
window.TeeNetFirmware=(()=>{
  function prefixInfo(bytes){
    if(bytes.length<288||bytes[0]!==0xe9||bytes[1]<1||bytes[1]>16||bytes[12]!==9||bytes[13]!==0||bytes[32]!==0x32||bytes[33]!==0x54||bytes[34]!==0xcd||bytes[35]!==0xab)throw Error('TeeNet-OTA-Datei für ESP32-S3 auswählen, kein USB-Image.');
    const text=(offset)=>{let end=offset;while(end<offset+32&&bytes[end])end++;if(end===offset+32)throw Error('Firmware-Kopf ungültig.');return new TextDecoder().decode(bytes.slice(offset,end));};
    const version=text(48);if(text(80)!=='wallbox_ems'||!/^\d+\.\d+$/.test(version))throw Error('Die Datei gehört nicht zu TeeNet.');
    const appHash=Array.from(bytes.slice(176,208),v=>v.toString(16).padStart(2,'0')).join('');
    return {version,appHash,project:'wallbox_ems',chip:'ESP32-S3'};
  }
  async function inspect(file,maximum=2097152){
    if(!file||!file.name.toLowerCase().endsWith('.bin')||file.size<1024||file.size>maximum)throw Error('TeeNet-OTA-Datei (.bin) bis 2 MB auswählen.');
    const bytes=new Uint8Array(await file.arrayBuffer()),info=prefixInfo(bytes);
    let integrity=false;
    if(bytes[23]===1&&window.crypto?.subtle){
      const digest=new Uint8Array(await window.crypto.subtle.digest('SHA-256',bytes.slice(0,-32)));
      if(!digest.every((v,i)=>v===bytes[bytes.length-32+i]))throw Error('Die Firmware ist beschädigt. Bitte erneut herunterladen.');
      integrity=true;
    }
    return {...info,integrity,bytes:file.size};
  }
  function compare(a,b){const [am,an]=a.split('.').map(Number),[bm,bn]=b.split('.').map(Number);return am-bm||an-bn;}
  function pending(){try{return JSON.parse(sessionStorage.getItem('teenet-update')||'null');}catch(_){return null;}}
  function remember(info,build){try{sessionStorage.setItem('teenet-update',JSON.stringify({version:info.version,appHash:info.appHash,build,at:Date.now()}));}catch(_){}}
  function checkBoot(s){
    const p=pending();if(!p)return null;
    if(s.version===p.version&&(s.app_elf_sha256?s.app_elf_sha256===p.appHash:s.build_id!==p.build)){try{sessionStorage.removeItem('teenet-update');}catch(_){}return `TeeNet ${s.version} ist installiert und wieder erreichbar. Ladung bleibt ausgeschaltet.`;}
    if(Date.now()-p.at>180000){try{sessionStorage.removeItem('teenet-update');}catch(_){}return 'Update noch nicht bestätigt. Version und Verbindung prüfen.';}
    return null;
  }
  return {prefixInfo,inspect,compare,remember,checkBoot};
})();
