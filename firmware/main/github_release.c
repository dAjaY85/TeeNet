#include "github_release.h"
#include "hardware_profile.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <ctype.h>
static bool version_valid(const char *v){
    bool dot=false,digit=false;size_t n=0,part=0;
    for(;*v;v++,n++){if(n>15)return false;if(isdigit((unsigned char)*v)){if(++part>5)return false;digit=true;continue;}if(*v=='.'&&digit&&!dot){dot=true;digit=false;part=0;continue;}return false;}
    return dot&&digit;
}
int firmware_version_compare(const char *a,const char *b){
    unsigned am=0,an=0,bm=0,bn=0;if(!version_valid(a)||!version_valid(b))return 0;
    if(sscanf(a,"%u.%u",&am,&an)!=2||sscanf(b,"%u.%u",&bm,&bn)!=2)return 0;
    return am>bm?1:am<bm?-1:an>bn?1:an<bn?-1:0;
}
bool github_release_parse(const char *json,size_t maximum,github_release_t *out){
    if(!json||!out)return false;
    cJSON *root=cJSON_Parse(json);
    if(!root)return false;
    bool ok=false;
    cJSON *tag=cJSON_GetObjectItem(root,"tag_name"),*draft=cJSON_GetObjectItem(root,"draft"),*pre=cJSON_GetObjectItem(root,"prerelease"),*assets=cJSON_GetObjectItem(root,"assets");
    if(!cJSON_IsString(tag)||tag->valuestring[0]!='v'||!version_valid(tag->valuestring+1)||
       !cJSON_IsFalse(draft)||!cJSON_IsFalse(pre)||!cJSON_IsArray(assets))goto finish;
    char name[64],url[224];snprintf(name,sizeof(name),"TeeNet-%s%s-ota.bin",tag->valuestring+1,EMS_OTA_ASSET_SUFFIX);
    snprintf(url,sizeof(url),"https://github.com/stetastic/TeeNet/releases/download/%s/%s",tag->valuestring,name);
    cJSON *asset;
    cJSON_ArrayForEach(asset,assets){
        cJSON *n=cJSON_GetObjectItem(asset,"name"),*u=cJSON_GetObjectItem(asset,"browser_download_url"),*s=cJSON_GetObjectItem(asset,"size"),*h=cJSON_GetObjectItem(asset,"digest");
        if(!cJSON_IsString(n)||strcmp(n->valuestring,name))continue;
        if(ok){ok=false;break;}
        if(!cJSON_IsString(u)||strcmp(u->valuestring,url)||!cJSON_IsNumber(s)||!isfinite(s->valuedouble)||s->valuedouble<1024||s->valuedouble>maximum||floor(s->valuedouble)!=s->valuedouble||
           !cJSON_IsString(h)||strncmp(h->valuestring,"sha256:",7)||strlen(h->valuestring)!=71)break;
        bool hash=true;for(int i=7;i<71;i++)if(!isxdigit((unsigned char)h->valuestring[i]))hash=false;
        if(!hash)break;
        strcpy(out->version,tag->valuestring+1);strcpy(out->url,url);out->bytes=(uint32_t)s->valuedouble;
        for(int i=0;i<64;i++)out->sha256[i]=(char)tolower((unsigned char)h->valuestring[i+7]);
        out->sha256[64]=0;ok=true;
    }
finish:cJSON_Delete(root);return ok;
}
