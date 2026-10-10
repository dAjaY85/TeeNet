#pragma once
#include <stdbool.h>
#include <stdint.h>
#define P(id,group,label,unit,def,lo,hi,step,help) EP_##id,
typedef enum {
#include "expert_params.def"
EP_COUNT } expert_id_t;
#undef P
typedef struct { const char *id,*group,*label,*unit,*help; float standard,minimum,maximum,step; } expert_meta_t;
typedef struct { uint32_t version; float values[EP_COUNT]; } expert_values_t;
extern const expert_meta_t expert_meta[EP_COUNT];
float ems_param(expert_id_t id);
int64_t ems_param_ms(expert_id_t id);
void expert_defaults(expert_values_t *values);
bool expert_valid(const expert_values_t *values);
bool expert_activate(const expert_values_t *values);
bool expert_decode(const void *blob,unsigned length,expert_values_t *values);
bool expert_pin_valid(const char *pin);
