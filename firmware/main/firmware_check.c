#include "firmware_check.h"
#include "hardware_profile.h"
#include <string.h>
bool firmware_prefix_check(const uint8_t *data,size_t size,char version[32]) {
    if(!data||!version||size<EMS_FIRMWARE_PREFIX)return false;
    if(data[0]!=0xe9||data[1]<1||data[1]>16||(data[3]&0xf0)!=EMS_FLASH_SIZE_NIBBLE||data[12]!=9||data[13]!=0)return false;
    if(data[32]!=0x32||data[33]!=0x54||data[34]!=0xcd||data[35]!=0xab)return false;
    if(!memchr(data+80,0,32)||strcmp((const char *)data+80,"wallbox_ems"))return false;
    const uint8_t *text=data+48;size_t end=0;bool dot=false,digit=false;
    for(;end<32&&text[end];end++) {
        if(text[end]>='0'&&text[end]<='9'){digit=true;continue;}
        if(text[end]=='.'&&!dot&&digit){dot=true;digit=false;continue;}
        return false;
    }
    if(end==32||!dot||!digit)return false;
    memcpy(version,text,end);version[end]=0;return true;
}
