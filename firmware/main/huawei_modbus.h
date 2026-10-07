#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* SUN2000MA: FC03, protocol addresses, high word first. Read-only. */
bool huawei_reply_header(const uint8_t header[9],uint16_t transaction,
                         uint8_t unit,uint16_t count,uint8_t *exception);
bool huawei_model_decode(const uint8_t *data,size_t length,char model[31]);
bool huawei_power_decode(const uint8_t data[4],float *watts);
bool huawei_battery_decode(const uint8_t *data,size_t length,bool aggregate,
                           float *soc,float *charge_w,float *discharge_w);
bool huawei_grid_decode(const uint8_t *data,size_t length,float *import_w);
/* 37100..37125, including online status and three-phase meter type. */
bool huawei_grid_currents_decode(const uint8_t *data,size_t length,float amps[3]);
