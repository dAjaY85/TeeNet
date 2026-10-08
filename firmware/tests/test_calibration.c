#include "ems_core.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
int main(void){
    settings_t s;settings_defaults(&s);s.enabled=true;s.mode=MODE_MANUAL;s.manual_current_a=12;
    current_calibration_t c={0};float actual[]={12.8f,12.8f,12.8f};
    for(int64_t t=1000;t<=121000;t+=1000)current_calibration_step(&c,&s,true,12,actual,t,t);
    assert(c.adjustments==1 && fabsf(s.current_offset_a-.85f)<.001f);
    float keep=s.current_offset_a;
    /* A stop, missing/stale/repeated data, limits and near-minimum operation never learn. */
    for(int mode=0;mode<6;mode++){
        c=(current_calibration_t){0};s.mode=mode==1?MODE_PV:MODE_MANUAL;
        s.enabled=mode!=2;s.charge_phases=mode==3?1:3;
        for(int64_t t=200000;t<400000;t+=1000)
            current_calibration_step(&c,&s,mode!=0,mode==4?8:12,actual,mode==5?200000:t,t);
        assert(s.current_offset_a==keep);
    }
    settings_defaults(&s);s.enabled=true;s.mode=MODE_MANUAL;c=(current_calibration_t){0};
    for(int64_t t=1000;t<300000;t+=1000){float a=t%2000?12:12.6f;float noisy[]={a,a,a};current_calibration_step(&c,&s,true,12,noisy,t,t);}
    assert(c.adjustments==0);
    float out[3];s.current_offset_a=2;float floor[]={8,8,8};control_report(&s,floor,8,0,false,out);
    assert(fabsf(out[0]-s.grid_limit_a)<.001f);
    puts("PASS: bounded calibration, stable window, stale samples, PV and stop isolation, minimum floor preserved");
}
