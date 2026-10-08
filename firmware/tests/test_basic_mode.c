#include "ems_core.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    settings_t s;settings_defaults(&s);
    s.basic_mode=true;s.mode=MODE_PV;s.enabled=true;
    s.expert_mode=s.zero_feed_enabled=s.battery_protect=s.vehicle_soc_enabled=true;
    s.pv_display_enabled=s.charge_plan_enabled=s.external_mode_input_enabled=true;
    s.evu_input_enabled=s.grid_guard_enabled=s.phase_switch_enabled=s.relay_board_enabled=true;
    s.huawei_enabled=s.huawei_battery=s.huawei_pv=true;
    strcpy(s.house_meter_type,"huawei");
    s.homeassistant_enabled=true;
    settings_basic_mode(&s);
    assert(!s.enabled && s.mode==MODE_OFF);
    assert(!s.expert_mode && !s.zero_feed_enabled && !s.battery_protect);
    assert(!s.vehicle_soc_enabled && !s.pv_display_enabled && !s.charge_plan_enabled);
    assert(!s.external_mode_input_enabled && !s.evu_input_enabled && !s.grid_guard_enabled);
    assert(!s.phase_switch_enabled && !s.relay_board_enabled && !s.huawei_enabled);
    assert(s.mqtt_enabled && s.homeassistant_enabled && s.basic_mode && settings_valid(&s));
    s.mode=MODE_MANUAL;s.enabled=true;settings_basic_mode(&s);
    assert(s.enabled && s.mode==MODE_MANUAL && s.manual_current_a==8);
    settings_t old;settings_defaults(&old);old.version=24;
    old.phase_switch_enabled=old.relay_board_enabled=true;old.relay1_mode=3;
    old.zero_feed_enabled=old.battery_protect=true;
    /* Padding in an old blob must not become the new profile flag. */
    size_t prefix=offsetof(settings_t,basic_mode),length=(prefix+3)&~(size_t)3;
    memset((char *)&old+prefix,0xff,length-prefix);
    settings_t loaded;assert(settings_decode(&old,length,&loaded));
    assert(!loaded.basic_mode && loaded.phase_switch_enabled && loaded.battery_protect);
    settings_t before;settings_defaults(&before);before.vehicle_soc_enabled=before.pv_display_enabled=false;
    settings_t runtime=before,next=before;runtime.mode=MODE_MANUAL;runtime.enabled=true;
    next.basic_mode=true;settings_basic_mode(&next);
    assert(settings_apply_live(&runtime,&before,&next));
    assert(runtime.basic_mode && runtime.enabled && runtime.mode==MODE_MANUAL);
    puts("PASS: basic profile disables extras, retains MQTT/manual control, preserves old configurations and ignores old padding");
    return 0;
}
