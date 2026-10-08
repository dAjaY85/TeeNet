#pragma once
#include "ems_core.h"
typedef struct {
    float soc,voltage,current,pv;
    int64_t soc_at,voltage_at,current_at,age_at,online_at,pv_at,pv_valid_at;
    float age;
    bool online,pv_valid;
} opendtu_state_t;
bool opendtu_receive(opendtu_state_t *state,const settings_t *settings,const char *topic,const char *payload,bool retained,int64_t now);
bool opendtu_battery_fresh(const opendtu_state_t *state,int64_t now);
bool opendtu_power(const opendtu_state_t *state,const settings_t *settings,int64_t now,float *charge,float *discharge);
bool opendtu_pv_fresh(const opendtu_state_t *state,const settings_t *settings,int64_t now);
