"""Mirror firmware expert metadata for the hardware-free local preview."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
def make_schema():
    app=(ROOT/'main/app.c').read_text(encoding='utf-8')
    fields=app.split('static const field_t fields[]={',1)[1].split('};',1)[0]
    defaults={name:False if kind=='b' else '' if kind in ('s','p') else 0 for name,kind in re.findall(r"FIELD\((\w+),'(.)'\)",fields)}
    source=(ROOT/'main/ems_core.c').read_text(encoding='utf-8').split('void settings_defaults(',1)[1].split('static bool range',1)[0]
    pins={'EMS_DEFAULT_SHELL_TX_PIN':17,'EMS_DEFAULT_SHELL_RX_PIN':18,'EMS_DEFAULT_METER_TX_PIN':4,'EMS_DEFAULT_METER_RX_PIN':5,'EMS_DEFAULT_MODE_INPUT_PIN':6}
    for name,value in re.findall(r's->(\w+)\s*=\s*(true|false|EMS_DEFAULT_\w+|-?\d+(?:\.\d+)?f?)\s*;',source):
        if name in defaults:defaults[name]=value=='true' if value in ('true','false') else pins[value] if value in pins else float(value.rstrip('f'))
    for name,value in re.findall(r'strcpy\(s->(\w+),\s*"([^"]*)"\)',source):
        if name in defaults:defaults[name]=value
    defaults['xemex_address']=1
    for key in ['wifi_password','mqtt_password']:defaults.pop(key,None)
    parameters=[]
    for line in (ROOT/'main/expert_params.def').read_text(encoding='utf-8').splitlines():
        if not line.startswith('P('):continue
        key,rest=line[2:-1].split(',',1)
        values=json.loads('['+rest+']')
        parameters.append(dict(zip(('id','group','label','unit','default','min','max','step','help'),[key,*values])))
    return {'parameters':parameters,'defaults':defaults}
if __name__=='__main__':
    dest=ROOT/'preview/expert-schema.json';dest.write_text(json.dumps(make_schema(),ensure_ascii=False),encoding='utf-8');print(dest)
