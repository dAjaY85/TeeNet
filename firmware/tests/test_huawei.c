#include "ems_core.h"
#include "huawei_modbus.h"
#include <assert.h>
#include <math.h>
#include <string.h>
#include <stdio.h>
static void put16(uint8_t *p,uint16_t v){p[0]=v>>8;p[1]=v;}
static void put32(uint8_t *p,int32_t v){uint32_t n=(uint32_t)v;p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n;}
int main(void){
    uint8_t header[9]={0x12,0x34,0,0,0,33,1,3,30},exception=99;
    assert(huawei_reply_header(header,0x1234,1,15,&exception)&&exception==0);
    assert(!huawei_reply_header(header,0x1235,1,15,&exception));
    assert(!huawei_reply_header(header,0x1234,2,15,&exception));
    assert(!huawei_reply_header(header,0x1234,1,14,&exception));
    header[2]=1;assert(!huawei_reply_header(header,0x1234,1,15,&exception));header[2]=0;
    header[5]=3;header[7]=0x83;header[8]=2;
    assert(!huawei_reply_header(header,0x1234,1,15,&exception)&&exception==2);
    assert(!huawei_reply_header(header,0x1235,1,15,&exception)&&exception==0);
    uint8_t data[30]={0};char model[31];float soc,charge,discharge,grid,power;
    memcpy(data,"SUN2000-8KTL-M1",14);assert(huawei_model_decode(data,30,model));
    assert(!huawei_model_decode(data,29,model));memcpy(data,"Shelly",6);assert(!huawei_model_decode(data,30,model));
    memset(data,0,30);put16(data,725);put16(data+4,2);put32(data+10,-4000);
    assert(huawei_battery_decode(data,14,true,&soc,&charge,&discharge));assert(soc==72.5f&&charge==0&&discharge==4000);
    put32(data+10,2000);assert(huawei_battery_decode(data,14,true,&soc,&charge,&discharge));assert(charge==2000&&discharge==0);
    put16(data+4,0);assert(!huawei_battery_decode(data,14,true,&soc,&charge,&discharge));
    put16(data+4,3);assert(!huawei_battery_decode(data,14,true,&soc,&charge,&discharge));
    put16(data+4,1);put16(data,65535);assert(!huawei_battery_decode(data,14,true,&soc,&charge,&discharge));
    memset(data,0,30);put16(data,2);put32(data+2,-1000);put16(data+8,500);assert(huawei_battery_decode(data,10,false,&soc,&charge,&discharge));assert(soc==50&&discharge==1000);
    memset(data,0,30);put16(data,1);put32(data+26,2500);assert(huawei_grid_decode(data,30,&grid));assert(grid==-2500);
    put32(data+26,-2500);assert(huawei_grid_decode(data,30,&grid));assert(grid==2500);
    put16(data,0);assert(!huawei_grid_decode(data,30,&grid));
    put32(data,INT32_MAX);assert(!huawei_power_decode(data,&power));put32(data,-1);assert(huawei_power_decode(data,&power)&&power==-1);
    uint8_t meter[52]={0};float currents[3]={99,98,97};
    put16(meter,1);put16(meter+50,1);
    put32(meter+14,1234);put32(meter+18,-3525);put32(meter+22,0);put32(meter+26,-4000);
    assert(huawei_grid_decode(meter,52,&grid)&&grid==4000);
    assert(huawei_grid_currents_decode(meter,52,currents));
    assert(fabsf(currents[0]-12.34f)<.001f&&currents[1]==35.25f&&currents[2]==0);
    put16(meter+50,0);assert(!huawei_grid_currents_decode(meter,52,currents));
    assert(huawei_grid_decode(meter,52,&grid)); /* single-phase meter still supplies PV power */
    put16(meter+50,0xffff);assert(!huawei_grid_currents_decode(meter,52,currents));
    put16(meter+50,1);put16(meter,0);assert(!huawei_grid_currents_decode(meter,52,currents));
    put16(meter,1);assert(!huawei_grid_currents_decode(meter,30,currents));
    assert(!huawei_grid_currents_decode(NULL,52,currents));
    assert(!huawei_grid_currents_decode(meter,52,NULL));
    for(unsigned phase=0;phase<3;phase++){
        uint8_t *at=meter+14+phase*4;int32_t previous=phase==0?1234:phase==1?-3525:0;
        put32(at,INT32_MAX);assert(!huawei_grid_currents_decode(meter,52,currents));
        assert(fabsf(currents[0]-12.34f)<.001f&&currents[1]==35.25f&&currents[2]==0);
        put32(at,INT32_MIN);assert(!huawei_grid_currents_decode(meter,52,currents));
        put32(at,100001);assert(!huawei_grid_currents_decode(meter,52,currents));
        put32(at,previous);
    }
    /* Invalid total power and phase readings are independent. */
    put32(meter+26,INT32_MAX);assert(!huawei_grid_decode(meter,52,&grid));
    assert(huawei_grid_currents_decode(meter,52,currents));
    put32(meter+26,0);memset(meter+14,0,12);
    assert(huawei_grid_currents_decode(meter,52,currents)&&currents[0]==0&&currents[1]==0&&currents[2]==0);
    settings_t old,next;settings_defaults(&old);old.version=18;old.charge_plan_enabled=true;old.huawei_enabled=true;
    assert(settings_decode(&old,(offsetof(settings_t,huawei_enabled)+3)&~(size_t)3,&next));
    assert(next.charge_plan_enabled&&!next.huawei_enabled&&!next.huawei_battery&&!next.huawei_pv&&next.huawei_unit_id==1);
    settings_defaults(&next);next.mqtt_enabled=false;next.vehicle_soc_enabled=false;next.pv_display_enabled=true;
    next.huawei_enabled=next.huawei_battery=next.huawei_pv=true;strcpy(next.huawei_host,"192.168.1.90");strcpy(next.house_meter_type,"huawei");next.zero_feed_enabled=next.battery_protect=true;
    assert(settings_valid(&next));next.grid_guard_enabled=true;assert(settings_valid(&next));
    next.huawei_enabled=false;assert(!settings_valid(&next));
    puts("Huawei registers, signs, unavailable values, settings migration and source isolation: OK");return 0;
}
