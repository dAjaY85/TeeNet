/* HTTP handlers share the application's validated configuration and state lock. */
static esp_err_t config_get(httpd_req_t *req){return send_json(req,config_json(false));}
static esp_err_t config_post(httpd_req_t *req) {
    if(!authorized(req))return ESP_OK;
    cJSON *o=read_json(req);return o?config_apply(req,o,false):ESP_OK;
}
static esp_err_t backup_handler(httpd_req_t *req) {
    if(!authorized(req))return ESP_OK;
    char query[32];bool secrets=httpd_req_get_url_query_str(req,query,sizeof(query))==ESP_OK&&!strcmp(query,"secrets=1");
    cJSON *root=cJSON_CreateObject(),*config=config_json(secrets);
    if(!root||!config){cJSON_Delete(root);cJSON_Delete(config);return send_json(req,NULL);}
    cJSON_DeleteItemFromObject(config,"wifi_password_set");cJSON_DeleteItemFromObject(config,"mqtt_password_set");
    cJSON_AddStringToObject(root,"format","TeeNet-settings");cJSON_AddNumberToObject(root,"schema",1);
    cJSON_AddStringToObject(root,"build_id",EMS_BUILD_ID);cJSON_AddBoolToObject(root,"includes_passwords",secrets);
    cJSON_AddItemToObject(root,"settings",config);
    httpd_resp_set_hdr(req,"Content-Disposition","attachment; filename=\"TeeNet-Einstellungen.json\"");
    return send_json(req,root);
}
static esp_err_t restore_handler(httpd_req_t *req) {
    if(!authorized(req))return ESP_OK;
    cJSON *root=read_json(req);if(!root)return ESP_OK;
    cJSON *format=cJSON_GetObjectItem(root,"format"),*schema=cJSON_GetObjectItem(root,"schema");
    cJSON *config=cJSON_DetachItemFromObject(root,"settings");
    bool valid=cJSON_IsString(format)&&!strcmp(format->valuestring,"TeeNet-settings")&&
        cJSON_IsNumber(schema)&&schema->valuedouble==1&&cJSON_IsObject(config)&&config->child;
    cJSON_Delete(root);
    if(valid)for(cJSON *i=config->child;i;i=i->next)for(cJSON *j=i->next;j;j=j->next)if(!strcmp(i->string,j->string))valid=false;
    if(!valid){cJSON_Delete(config);return httpd_resp_send_err(req,HTTPD_400_BAD_REQUEST,"Keine passende TeeNet-Einstellungssicherung.");}
    return config_apply(req,config,true);
}
#include "diagnostic_http.inc"
static esp_err_t plan_handler(httpd_req_t *req) {
    LOCK();bool evcc_owner=evcc_control.configured||evcc_configuring;UNLOCK();
    if(evcc_owner){httpd_resp_set_status(req,"409 Conflict");return httpd_resp_sendstr(req,"Ladeplan im evcc-Modus nicht verfuegbar.");}
    if(!authorized(req))return ESP_OK;
    cJSON *o=read_json(req);if(!o)return ESP_OK;
    cJSON *active=cJSON_GetObjectItem(o,"active"),*kwh=cJSON_GetObjectItem(o,"kwh"),*deadline=cJSON_GetObjectItem(o,"deadline_epoch"),*resume=cJSON_GetObjectItem(o,"resume");
    bool activate=cJSON_IsTrue(active),resuming=cJSON_IsTrue(resume),valid=cJSON_IsBool(active) && (!resume||cJSON_IsBool(resume));
    for(cJSON *i=o->child;i;i=i->next)if(strcmp(i->string,"active")&&strcmp(i->string,"kwh")&&strcmp(i->string,"deadline_epoch")&&strcmp(i->string,"resume"))valid=false;
    int64_t epoch,midnight;bool clock_ok=calendar(&epoch,&midnight)!=0;
    LOCK();charge_plan_t next=charge_plan;
    if(activate) {
        valid=valid && settings.charge_plan_enabled && clock_ok && settings.control_verified && settings.zero_feed_enabled && !settings.external_mode_input_enabled &&
            !reboot_required&&!restarting&&!ota_in_progress;
        if(resuming)valid=valid && next.active && next.deadline_s>epoch/1000;
        else valid=valid && cJSON_IsNumber(kwh)&&cJSON_IsNumber(deadline)&&isfinite(deadline->valuedouble)&&
            deadline->valuedouble>=1704067200&&deadline->valuedouble<=4102444800LL&&floor(deadline->valuedouble)==deadline->valuedouble&&
            charge_plan_start(&next,kwh->valuedouble,(int64_t)deadline->valuedouble,epoch/1000,energy.store.total_wh[0]);
    }else {next.active=false;next.complete=false;next.expired=false;}
    if(valid) {
        charge_plan=next;charge_plan.last_total_wh=energy.store.total_wh[0];plan_dirty=true;plan_revision++;
        settings.enabled=activate;settings.mode=activate?(next.grid?MODE_MANUAL:MODE_PV):MODE_OFF;
        if(next.grid&&activate){settings.manual_phases=settings.phase_switch_enabled?3:settings.fixed_charge_phases;settings.manual_current_a=settings.max_charge_a;}
        plan_phase=activate?(next.grid?PLAN_GRID:PLAN_PV):PLAN_OFF;
        memset(&charge_guard,0,sizeof(charge_guard));
        pv_control_step(&pv_control,false,0,active_min_a(),settings.max_charge_a,now_ms());
        event_locked(activate?"plan_started":"plan_cancelled");
    }
    UNLOCK();cJSON_Delete(o);
    if(!valid)return httpd_resp_send_err(req,HTTPD_400_BAD_REQUEST,"Ladeplan: Uhrzeit, Hauszaehler, Freigabe und Ziel pruefen. Externer Moduskontakt darf nicht aktiv sein.");
    if(!save_plan()){LOCK();settings.enabled=false;charge_plan.active=false;plan_phase=PLAN_OFF;plan_dirty=true;plan_revision++;event_locked("plan_storage");UNLOCK();
        return httpd_resp_send_err(req,HTTPD_500_INTERNAL_SERVER_ERROR,"Ladeplan konnte nicht gespeichert werden; Ladung gestoppt.");}
    return ok_json(req);
}
