#include "diagnostic_store.h"
#include "firmware_check.h"
#include "hardware_profile.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int main(void){
    diagnostic_store_t store,copy;diagnostic_store_init(&store);
    ems_event_t e={.sequence=1,.uptime_s=3};strcpy(e.reason,"none");assert(!diagnostic_store_add(&store,&e));
    strcpy(e.reason,"meter");for(unsigned i=0;i<20;i++){e.sequence=i;assert(diagnostic_store_add(&store,&e));}
    assert(store.count==16);assert(diagnostic_store_recent(&store,0)->sequence==19);assert(diagnostic_store_recent(&store,15)->sequence==4);assert(!diagnostic_store_recent(&store,16));
    diagnostic_store_seal(&store);assert(diagnostic_store_restore(&copy,&store,sizeof(store)));assert(copy.count==16);
    assert(!diagnostic_store_restore(&copy,&store,sizeof(store)-1));store.entries[0].actual_kw=123;assert(!diagnostic_store_restore(&copy,&store,sizeof(store)));
    diagnostic_store_seal(&store);store.count=17;diagnostic_store_seal(&store);assert(!diagnostic_store_restore(&copy,&store,sizeof(store)));
    diagnostic_store_init(&store);memset(e.reason,'x',sizeof(e.reason));assert(!diagnostic_store_add(&store,&e));
    uint8_t bytes[288]={0};char version[32];bytes[0]=0xe9;bytes[1]=4;bytes[3]=EMS_FLASH_SIZE_NIBBLE;bytes[12]=9;bytes[32]=0x32;bytes[33]=0x54;bytes[34]=0xcd;bytes[35]=0xab;
    strcpy((char *)bytes+48,"1.10");strcpy((char *)bytes+80,"wallbox_ems");assert(firmware_prefix_check(bytes,sizeof(bytes),version));assert(!strcmp(version,"1.10"));
    assert(!firmware_prefix_check(bytes,287,version));bytes[3]^=0x70;assert(!firmware_prefix_check(bytes,sizeof(bytes),version));bytes[3]=EMS_FLASH_SIZE_NIBBLE;bytes[12]=0;assert(!firmware_prefix_check(bytes,sizeof(bytes),version));bytes[12]=9;
    strcpy((char *)bytes+80,"other_project");assert(!firmware_prefix_check(bytes,sizeof(bytes),version));strcpy((char *)bytes+80,"wallbox_ems");
    strcpy((char *)bytes+48,"1.");assert(!firmware_prefix_check(bytes,sizeof(bytes),version));strcpy((char *)bytes+48,"1.10.1");assert(!firmware_prefix_check(bytes,sizeof(bytes),version));
    memset(bytes+48,'1',32);assert(!firmware_prefix_check(bytes,sizeof(bytes),version));
    puts("PASS: bounded persistent fault history, checksum and restore validation; OTA rejects wrong chips/projects/truncated headers");return 0;
}
