#include "cJSON.h"
#include "ems_core.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define TERMS_REVISION "2026-10-09.2"
#define LOCK() ((void)0)
#define UNLOCK() ((void)0)
#define ESP_OK 0
#define ESP_FAIL -1
#define NVS_READONLY 0
#define NVS_READWRITE 1
#define HTTPD_400_BAD_REQUEST 400
#define HTTPD_500_INTERNAL_SERVER_ERROR 500
typedef int esp_err_t;typedef int nvs_handle_t;
typedef struct {int content_len;const char *body;bool authorized;} httpd_req_t;
static bool terms_accepted,config_storage_ok=true;
static settings_t settings;
static int response,storage_error;
static char saved_revision[32],pending_revision[32];
static int nvs_open(const char *space,int mode,nvs_handle_t *handle){(void)mode;assert(!strcmp(space,"wallbox_ems"));*handle=1;return 0;}
static int nvs_get_str(nvs_handle_t h,const char *key,char *value,size_t *size){(void)h;assert(!strcmp(key,"terms_rev"));if(!saved_revision[0])return -1;assert(*size>strlen(saved_revision));strcpy(value,saved_revision);return 0;}
static int nvs_set_str(nvs_handle_t h,const char *key,const char *value){(void)h;assert(!strcmp(key,"terms_rev"));strcpy(pending_revision,value);return storage_error;}
static int nvs_commit(nvs_handle_t h){(void)h;if(storage_error)return storage_error;strcpy(saved_revision,pending_revision);return 0;}
static void nvs_close(nvs_handle_t h){(void)h;}
static int httpd_resp_send_err(httpd_req_t *req,int status,const char *message){(void)req;(void)message;response=status;return 0;}
static bool authorized(httpd_req_t *req){if(!req->authorized)response=403;return req->authorized;}
static cJSON *read_json(httpd_req_t *req){return cJSON_Parse(req->body);}
static int ok_json(httpd_req_t *req){(void)req;response=200;return 0;}
#include "terms_http.inc"
static int submit(const char *body,bool permission){httpd_req_t r={(int)strlen(body),body,permission};response=0;terms_post(&r);return response;}
int main(void){
 settings_defaults(&settings);terms_load();assert(!terms_accepted);
 assert(submit("{\"accepted\":true,\"revision\":\"2026-10-09.2\"}",false)==403&&!terms_accepted);
 assert(submit("{\"accepted\":false,\"revision\":\"2026-10-09.2\"}",true)==400&&!terms_accepted);
 assert(submit("{\"accepted\":true,\"revision\":\"old\"}",true)==400&&!terms_accepted);
 assert(submit("{\"accepted\":true,\"revision\":\"2026-10-09.2\",\"extra\":true}",true)==400&&!terms_accepted);
 storage_error=-1;assert(submit("{\"accepted\":true,\"revision\":\"2026-10-09.2\"}",true)==500&&!terms_accepted);
 storage_error=0;settings.enabled=true;settings.mode=MODE_MANUAL;
 assert(submit("{\"accepted\":true,\"revision\":\"2026-10-09.2\"}",true)==200&&terms_accepted);
 assert(!settings.enabled&&settings.mode==MODE_OFF);
 terms_accepted=false;terms_load();assert(terms_accepted); /* Reboot retains explicit acceptance. */
 strcpy(saved_revision,"old");terms_accepted=false;terms_load();assert(!terms_accepted);
 puts("PASS: explicit consent, token/revision/shape validation, NVS failure and reboot persistence; acceptance never starts charging");
}
