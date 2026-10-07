#include "meter_json.h"
#include "cJSON.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

bool house_power_is_url(const char *selector) {
    return selector && (!strncmp(selector,"http://",7) || !strncmp(selector,"https://",8));
}
bool house_query_url(const char *type,const char *host,const char *selector,char *url,size_t capacity) {
    int written;
    if(house_power_is_url(selector)) {
        const char *authority=strstr(selector,"://")+3;
        size_t authority_len=strcspn(authority,"/?#");
        if(!authority_len || memchr(authority,'@',authority_len) || strchr(selector,'#')) return false;
        for(const unsigned char *p=(const unsigned char *)selector;*p;p++) if(*p<=32 || *p==127 || *p=='\\') return false;
        written=snprintf(url,capacity,"%s",selector);
    } else {
        if(!host[0] || strstr(selector,"://")) return false;
        const char *endpoint=!strcmp(type,"tasmota")?"/cm?cmnd=Status%2010":NULL;
        if(!endpoint)return false;
        written=snprintf(url,capacity,"http://%s%s",host,endpoint);
    }
    return written>0 && (size_t)written<capacity;
}

static cJSON *at_path(cJSON *node,const char *path) {
    char copy[96]; if(strlen(path)>=sizeof(copy)) return NULL;
    strcpy(copy,path);
    char *key=copy;
    while(node && key && *key) {
        char *next=strchr(key,'.'); if(next) *next++=0;
        if(cJSON_IsArray(node)) {
            char *end; long index=strtol(key,&end,10);
            if(end==key || *end || index<0 || index>100) return NULL;
            node=cJSON_GetArrayItem(node,(int)index);
        } else node=cJSON_GetObjectItemCaseSensitive(node,key);
        key=next;
    }
    return node;
}
static bool number(cJSON *node,double *out) {
    if(!cJSON_IsNumber(node) || !isfinite(node->valuedouble) || fabs(node->valuedouble)>1000000) return false;
    *out=node->valuedouble; return true;
}
static bool tasmota_power(cJSON *root,double *out) {
    cJSON *sensors=cJSON_GetObjectItemCaseSensitive(root,"StatusSNS");
    if(!cJSON_IsObject(sensors)) return false;
    unsigned candidates=0; double value=0;
    /* Verified Wattwaechter E320 and standard Tasmota ENERGY schemas only.
       Other scripts keep using an explicit JSON path. Ambiguity fails closed. */
    for(cJSON *sensor=sensors->child;sensor;sensor=sensor->next) {
        if(strcmp(sensor->string,"E320") && strcmp(sensor->string,"ENERGY")) continue;
        if(!cJSON_IsObject(sensor)) continue;
        cJSON *power=cJSON_GetObjectItemCaseSensitive(sensor,"Power");
        if(!power) continue;
        if(++candidates>1 || !number(power,&value)) return false;
    }
    if(candidates!=1) return false;
    *out=value; return true;
}
bool house_power_parse(const char *body,const char *type,const char *path,float *watts) {
    cJSON *root=cJSON_ParseWithOpts(body,NULL,true); if(!root) return false;
    double value=0; bool ok=false;
    if(path[0] && !house_power_is_url(path)) ok=number(at_path(root,path),&value);
    else if(!strcmp(type,"tasmota")) ok=tasmota_power(root,&value);
    cJSON_Delete(root);
    if(ok && isfinite(value) && fabs(value)<=1000000) { *watts=(float)value; return true; }
    return false;
}

/* Shell configuration only. Never treat chargingRate as current feedback. */
bool shell_limits_parse(const char *body,float *grid_a,float *max_a) {
 if(!body||!grid_a||!max_a||strlen(body)>6143)return false;
 cJSON *o=cJSON_ParseWithOpts(body,NULL,true);if(!o)return false;
 cJSON *limit=cJSON_GetObjectItemCaseSensitive(o,"maxLimit");
 cJSON *grid=cJSON_GetObjectItemCaseSensitive(limit,"current");
 cJSON *connectors=cJSON_GetObjectItemCaseSensitive(o,"connectors"),*found=NULL;
 if(cJSON_IsArray(connectors))for(cJSON *i=connectors->child;i;i=i->next){
  cJSON *id=cJSON_GetObjectItemCaseSensitive(i,"id");
  if(cJSON_IsNumber(id)&&id->valuedouble==1){if(found){cJSON_Delete(o);return false;}found=i;}
 }
 cJSON *maximum=cJSON_GetObjectItemCaseSensitive(found,"max");
 cJSON *current=cJSON_GetObjectItemCaseSensitive(maximum,"current");
 bool ok=cJSON_IsNumber(grid)&&cJSON_IsNumber(current)&&isfinite(grid->valuedouble)&&
  isfinite(current->valuedouble)&&grid->valuedouble>=6&&grid->valuedouble<=200&&
  current->valuedouble>=6&&current->valuedouble<=63;
 if(ok){*grid_a=grid->valuedouble;*max_a=current->valuedouble;}
 cJSON_Delete(o);return ok;
}
