#include "expert_params.h"
#include <math.h>
#include <string.h>
#define P(id,group,label,unit,def,lo,hi,step,help) {#id,group,label,unit,help,def,lo,hi,step},
const expert_meta_t expert_meta[EP_COUNT]={
#include "expert_params.def"
};
#undef P
static expert_values_t active;
void expert_defaults(expert_values_t *v){ v->version=1;for(unsigned i=0;i<EP_COUNT;i++)v->values[i]=expert_meta[i].standard; }
bool expert_valid(const expert_values_t *v){
 if(!v||v->version!=1)return false;
 for(unsigned i=0;i<EP_COUNT;i++){
  double n=v->values[i],steps=(n-expert_meta[i].minimum)/expert_meta[i].step;
  if(!isfinite(n)||n<expert_meta[i].minimum-.00001||n>expert_meta[i].maximum+.00001||fabs(steps-round(steps))>.002)return false;
 }
 return v->values[EP_PHASE_STOP_MAX]>v->values[EP_PHASE_ZERO] &&
        v->values[EP_PHASE_DATA_MAX]>v->values[EP_PHASE_SETTLE] &&
        v->values[EP_EVCC_LEASE]>v->values[EP_EVCC_STATUS_TTL];
}
bool expert_activate(const expert_values_t *v){if(!expert_valid(v))return false;active=*v;return true;}
float ems_param(expert_id_t id){return (unsigned)id<EP_COUNT?(active.version==1?active.values[id]:expert_meta[id].standard):0;}
int64_t ems_param_ms(expert_id_t id){return (int64_t)llround(ems_param(id)*1000);}
bool expert_decode(const void *blob,unsigned length,expert_values_t *v){
 if(!blob||!v||length!=sizeof(*v))return false;
 expert_values_t next;memcpy(&next,blob,sizeof(next));
 if(!expert_valid(&next))return false;
 *v=next;return true;
}
bool expert_pin_valid(const char *pin){return pin&&!strcmp(pin,"4040");}
