#include "ems_core.h"
#include "hardware_profile.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    settings_t s,out;settings_defaults(&s);
    assert(!strcmp(EMS_HARDWARE_ID,"andreas-testboard"));
    assert(s.wallbox_tx_pin==6 && s.wallbox_rx_pin==5);
    assert(s.xemex_tx_pin==1 && s.xemex_rx_pin==2);
    assert(s.external_mode_input_pin==1 && !s.external_mode_input_enabled);
    assert(settings_valid(&s));
    assert(settings_decode(&s,sizeof(s),&out));
    assert(out.wallbox_tx_pin==6 && out.wallbox_rx_pin==5);
    out.external_mode_input_enabled=true;
    assert(!settings_valid(&out)); /* GPIO1 still belongs to the serial meter. */
    strcpy(out.wallbox_meter_type,"em24_tcp");
    strcpy(out.wallbox_meter_host,"192.168.1.34");
    assert(settings_valid(&out)); /* Network meter frees GPIO1 for the contact. */
    puts("PASS: Andreas Testboard defaults, saved pins and optional GPIO1 mode contact");
    return 0;
}
