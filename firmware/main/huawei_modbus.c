#include "huawei_modbus.h"
#include <string.h>
#include <math.h>
#include <limits.h>
static uint16_t u16(const uint8_t *p){return (uint16_t)p[0]<<8|p[1];}
bool huawei_reply_header(const uint8_t h[9],uint16_t tx,uint8_t unit,uint16_t count,uint8_t *exception){
    if(!h||!exception)return false;
    *exception=0;
    if(!count||count>125||u16(h)!=tx||u16(h+2)!=0||h[6]!=unit)return false;
    if(u16(h+4)==3&&h[7]==0x83){*exception=h[8];return false;}
    return u16(h+4)==count*2+3&&h[7]==3&&h[8]==count*2;
}
bool huawei_model_decode(const uint8_t *data,size_t length,char model[31]){
    if(!data||length!=30||!model)return false;
    memcpy(model,data,30);model[30]=0;
    for(unsigned i=0;i<30&&model[i];i++)if((unsigned char)model[i]<32||(unsigned char)model[i]>126)return false;
    return !strncmp(model,"SUN2000-",8);
}
bool huawei_power_decode(const uint8_t data[4],float *watts){
    if(!data||!watts)return false;
    uint32_t raw=(uint32_t)u16(data)<<16|u16(data+2);
    if(raw==INT32_MAX)return false;
    int64_t value=raw&0x80000000U?(int64_t)raw-0x100000000LL:raw;
    if(value< -333333||value>333333)return false;
    *watts=(float)value;return true;
}
bool huawei_battery_decode(const uint8_t *data,size_t length,bool aggregate,float *soc,float *charge_w,float *discharge_w){
    if(!data||!soc||!charge_w||!discharge_w||length!=(aggregate?14:10))return false;
    uint16_t status=u16(data+(aggregate?4:0)),percent=u16(data+(aggregate?0:8));
    float power;
    if((status!=1&&status!=2&&status!=4)||percent>1000||
       !huawei_power_decode(data+(aggregate?10:2),&power))return false;
    *soc=percent/10.0f;*charge_w=fmaxf(0,power);*discharge_w=fmaxf(0,-power);return true;
}
bool huawei_grid_decode(const uint8_t *data,size_t length,float *import_w){
    float export_w;
    if(!data||(length!=30&&length!=52)||!import_w||u16(data)!=1||!huawei_power_decode(data+26,&export_w))return false;
    /* Huawei reports positive export; TeeNet uses positive import. */
    *import_w=-export_w;return true;
}
bool huawei_grid_currents_decode(const uint8_t *data,size_t length,float amps[3]){
    if(!data||!amps||length!=52||u16(data)!=1||u16(data+50)!=1)return false;
    float values[3];
    for(unsigned phase=0;phase<3;phase++){
        const uint8_t *p=data+14+phase*4; /* 37107, 37109, 37111; gain 100. */
        uint32_t raw=(uint32_t)u16(p)<<16|u16(p+2);
        if(raw==INT32_MAX||raw==0x80000000U)return false;
        int64_t signed_value=raw&0x80000000U?(int64_t)raw-0x100000000LL:raw;
        values[phase]=fabsf((float)signed_value/100.0f);
        if(values[phase]>1000)return false;
    }
    /* A partial/invalid sample must never replace a complete guard sample.
       Use magnitudes: both import and export load the phase conductor. */
    memcpy(amps,values,sizeof(values));return true;
}
