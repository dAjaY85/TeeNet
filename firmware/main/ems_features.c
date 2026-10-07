#include "ems_features.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

void ems_event_add(ems_events_t *log,const char *reason,int64_t epoch_s,int64_t uptime_s,
                   float target_kw,float actual_kw,float house_kw,float battery_pct) {
    ems_event_t *event=&log->entries[log->next];
    *event=(ems_event_t){.sequence=++log->sequence,.epoch_s=epoch_s,.uptime_s=uptime_s,
        .target_kw=target_kw,.actual_kw=actual_kw,.house_kw=house_kw,.battery_pct=battery_pct};
    snprintf(event->reason,sizeof(event->reason),"%s",reason);
    log->next=(log->next+1)%EMS_EVENT_CAPACITY;
    if(log->count<EMS_EVENT_CAPACITY)log->count++;
}
void ems_event_observe(ems_events_t *log,const char *reason,int64_t epoch_s,int64_t uptime_s,
                       float target_kw,float actual_kw,float house_kw,float battery_pct) {
    if(!strcmp(reason,log->last_reason))return;
    /* A one-second transient remains visible to the controller but does not flood diagnostics. */
    if(log->count && uptime_s-log->last_observed_s<2)return;
    ems_event_add(log,reason,epoch_s,uptime_s,target_kw,actual_kw,house_kw,battery_pct);
    snprintf(log->last_reason,sizeof(log->last_reason),"%s",reason);
    log->last_observed_s=uptime_s;
}
const ems_event_t *ems_event_recent(const ems_events_t *log,unsigned index) {
    if(index>=log->count)return NULL;
    return &log->entries[(log->next+EMS_EVENT_CAPACITY-1-index)%EMS_EVENT_CAPACITY];
}
bool charge_plan_start(charge_plan_t *p,float target_kwh,int64_t deadline_s,int64_t now_s,double total_wh) {
    if(!isfinite(target_kwh)||target_kwh<0.5f||target_kwh>100||!isfinite(total_wh)||total_wh<0||
       now_s<1704067200||deadline_s<=now_s||deadline_s-now_s>7*86400)return false;
    *p=(charge_plan_t){.version=1,.active=true,.target_wh=target_kwh*1000,
        .last_total_wh=total_wh,.deadline_s=deadline_s};
    return true;
}
plan_phase_t charge_plan_step(charge_plan_t *p,int64_t now_s,bool clock_ok,bool permitted,
                             double total_wh,float maximum_kw) {
    if(!p->active)return p->complete?PLAN_COMPLETE:p->expired?PLAN_EXPIRED:PLAN_OFF;
    if(isfinite(total_wh)&&total_wh>=0) {
        double delta=total_wh-p->last_total_wh;
        if(permitted && isfinite(p->last_total_wh) && delta>0)
            p->delivered_wh=fminf(p->target_wh,p->delivered_wh+(float)delta);
        p->last_total_wh=total_wh;
    }
    if(p->delivered_wh>=p->target_wh) {p->active=false;p->complete=true;return PLAN_COMPLETE;}
    if(!clock_ok)return PLAN_CLOCK;
    if(now_s>=p->deadline_s){p->active=false;p->expired=true;return PLAN_EXPIRED;}
    if(!permitted)return PLAN_PAUSED;
    if(!isfinite(maximum_kw)||maximum_kw<=0)return PLAN_PAUSED;
    double seconds=(p->target_wh-p->delivered_wh)/maximum_kw*3.6;
    /* Start grid completion early enough for the existing ramps and brief pauses. */
    double margin=fmax(300,seconds*.10);
    if((double)(p->deadline_s-now_s)<=seconds+margin)p->grid=true;
    return p->grid?PLAN_GRID:PLAN_PV;
}
const char *charge_plan_phase_name(plan_phase_t phase) {
    static const char *names[]={"off","pv","grid","complete","expired","paused","clock"};
    return phase>=PLAN_OFF&&phase<=PLAN_CLOCK?names[phase]:"off";
}
