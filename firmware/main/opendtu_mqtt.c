#include "opendtu_mqtt.h"
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <errno.h>
static bool recent(int64_t now,int64_t at){return at>0&&now>=at&&now-at<EMS_INPUT_TTL;}
static bool number(const char *text,float minimum,float maximum,float *value){
    errno=0;char *end;float v=strtof(text,&end);
    if(end==text||*end||errno||!isfinite(v)||v<minimum||v>maximum)return false;
    *value=v;return true;
}
static bool binary(const char *text,bool *value){
    if(!strcmp(text,"1")||!strcmp(text,"true")){*value=true;return true;}
    if(!strcmp(text,"0")||!strcmp(text,"false")){*value=false;return true;}
    return false;
}
bool opendtu_receive(opendtu_state_t *s,const settings_t *cfg,const char *topic,const char *payload,bool retained,int64_t now){
    if(!s||!cfg||!topic||!payload||cfg->mqtt_input_source!=2||!cfg->mqtt_enabled)return false;
    if(cfg->pv_display_enabled&&cfg->opendtu_pv_topic[0]&&!strcmp(topic,cfg->opendtu_pv_topic)){
        if(retained)return true;
        float value;if(!number(payload,0,25000,&value)){s->pv_at=0;return false;}s->pv=value;s->pv_at=now;return true;
    }
    if(cfg->pv_display_enabled&&cfg->opendtu_pv_valid_topic[0]&&!strcmp(topic,cfg->opendtu_pv_valid_topic)){
        bool valid;if(!binary(payload,&valid))return false;
        if(retained&&valid)return true;
        s->pv_valid=valid;s->pv_valid_at=now;if(!valid)s->pv_at=0;return true;
    }
    size_t n=strlen(cfg->opendtu_prefix);
    if(strncmp(topic,cfg->opendtu_prefix,n)||topic[n]!='/')return false;
    const char *key=topic+n+1;
    if(!strcmp(key,"dtu/status")){
        if(strcmp(payload,"online")&&strcmp(payload,"offline"))return false;
        bool online=!strcmp(payload,"online");if(retained&&online)return true;
        s->online=online;s->online_at=now;
        if(!online)s->soc_at=s->voltage_at=s->current_at=s->age_at=s->pv_at=s->pv_valid_at=0;
        return true;
    }
    if(strncmp(key,"battery/",8)||!cfg->battery_protect)return false;
    if(retained)return true;
    float value;
    if(!strcmp(key,"battery/stateOfCharge")){
        if(!number(payload,0,100,&value)){s->soc_at=0;return false;}s->soc=value;s->soc_at=now;return true;
    }
    if(!strcmp(key,"battery/dataAge")){
        if(!number(payload,0,86400,&value)){s->age_at=0;return false;}
        s->age=value;s->age_at=now;return true;
    }
    if(!strcmp(key,"battery/voltage")){
        if(!number(payload,1,1000,&value)){s->voltage_at=0;return false;}s->voltage=value;s->voltage_at=now;return true;
    }
    if(!strcmp(key,"battery/current")){
        if(!number(payload,-500,500,&value)){s->current_at=0;return false;}s->current=value;s->current_at=now;return true;
    }
    return false;
}
bool opendtu_battery_fresh(const opendtu_state_t *s,int64_t now){
    return recent(now,s->soc_at)&&recent(now,s->age_at)&&s->age+(now-s->age_at)/1000.0f<30 &&
        (!s->online_at||s->online);
}
bool opendtu_power(const opendtu_state_t *s,const settings_t *cfg,int64_t now,float *charge,float *discharge){
    if(!opendtu_battery_fresh(s,now)||!recent(now,s->voltage_at)||!recent(now,s->current_at))return false;
    float watts=s->voltage*s->current;
    if(cfg->opendtu_current_positive_discharge)watts=-watts;
    if(!isfinite(watts)||fabsf(watts)>12000)return false;
    *charge=fmaxf(0,watts);*discharge=fmaxf(0,-watts);return true;
}
bool opendtu_pv_fresh(const opendtu_state_t *s,const settings_t *cfg,int64_t now){
    return recent(now,s->pv_at)&&(!s->online_at||s->online)&&
        (!cfg->opendtu_pv_valid_topic[0]||(s->pv_valid&&recent(now,s->pv_valid_at)));
}
