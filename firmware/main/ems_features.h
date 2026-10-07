#pragma once
#include <stdbool.h>
#include <stdint.h>

#define EMS_EVENT_CAPACITY 48
typedef struct {
    uint32_t sequence;
    int64_t epoch_s, uptime_s;
    char reason[32];
    float target_kw, actual_kw, house_kw, battery_pct;
} ems_event_t;
typedef struct {
    ems_event_t entries[EMS_EVENT_CAPACITY];
    unsigned count, next;
    uint32_t sequence;
    char last_reason[32];
    int64_t last_observed_s;
} ems_events_t;
void ems_event_add(ems_events_t *log, const char *reason, int64_t epoch_s, int64_t uptime_s,
                   float target_kw, float actual_kw, float house_kw, float battery_pct);
void ems_event_observe(ems_events_t *log, const char *reason, int64_t epoch_s, int64_t uptime_s,
                       float target_kw, float actual_kw, float house_kw, float battery_pct);
const ems_event_t *ems_event_recent(const ems_events_t *log, unsigned index);

typedef enum { PLAN_OFF, PLAN_PV, PLAN_GRID, PLAN_COMPLETE, PLAN_EXPIRED, PLAN_PAUSED, PLAN_CLOCK } plan_phase_t;
typedef struct {
    uint32_t version;
    bool active, grid, complete, expired;
    float target_wh, delivered_wh;
    double last_total_wh;
    int64_t deadline_s;
} charge_plan_t;
bool charge_plan_start(charge_plan_t *p, float target_kwh, int64_t deadline_s, int64_t now_s, double total_wh);
plan_phase_t charge_plan_step(charge_plan_t *p, int64_t now_s, bool clock_ok, bool permitted,
                             double total_wh, float maximum_kw);
const char *charge_plan_phase_name(plan_phase_t phase);
