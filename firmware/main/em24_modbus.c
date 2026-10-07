#include "em24_modbus.h"
#include <string.h>

/* Signed INT32, big-endian bytes within each word, low word first.
   7FFF in the high word is the instrument's overflow indication. */
static bool signed_value(const uint8_t *data, int32_t *out) {
    uint16_t high=((uint16_t)data[2]<<8)|data[3];
    if(high==0x7fff)return false;
    uint32_t bits=((uint32_t)high<<16)|((uint32_t)data[0]<<8)|data[1];
    memcpy(out,&bits,sizeof(bits));
    return true;
}

bool em24_modbus_decode(const uint8_t *currents,size_t current_length,
                       const uint8_t *power,size_t power_length,em24_reading_t *out) {
    if(!currents || !power || !out || current_length!=EM24_CURRENT_COUNT*2 ||
       power_length!=EM24_POWER_COUNT*2)return false;
    em24_reading_t next={0};
    for(unsigned phase=0;phase<3;phase++) {
        int32_t raw;
        if(!signed_value(currents+phase*4,&raw) || raw<0 || raw>999000)return false;
        next.current_a[phase]=(float)raw/1000.0f;
    }
    int32_t raw_power;
    if(!signed_value(power,&raw_power) || raw_power < -10000000 || raw_power > 10000000)return false;
    next.active_power_w=(float)raw_power/10.0f;
    *out=next;
    return true;
}
