#pragma once
#include "ems_features.h"
#include <stddef.h>
#define EMS_FAULT_CAPACITY 16
typedef struct {
    uint32_t magic,version;
    unsigned count,next;
    ems_event_t entries[EMS_FAULT_CAPACITY];
    uint32_t checksum;
} diagnostic_store_t;
void diagnostic_store_init(diagnostic_store_t *store);
bool diagnostic_store_add(diagnostic_store_t *store,const ems_event_t *event);
void diagnostic_store_seal(diagnostic_store_t *store);
bool diagnostic_store_restore(diagnostic_store_t *store,const void *data,size_t size);
const ems_event_t *diagnostic_store_recent(const diagnostic_store_t *store,unsigned index);
