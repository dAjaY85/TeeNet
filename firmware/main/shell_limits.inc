/* Slow configuration lookup only; Xemex/Modbus remains the live feedback. */
static int shell_read_limits(const char *host,float *grid,float *maximum) {
    char url[112];int n=snprintf(url,sizeof(url),"http://%s:12800/user/status",host);
    if(n<=0 || (size_t)n>=sizeof(url))return 0;
    char *body=malloc(6144);if(!body)return 0;
    int code=http_get_body_mode(url,body,6144,5000,true);
    if(code==200 && !shell_limits_parse(body,grid,maximum))code=422;
    free(body);return code;
}
static void shell_scan_task(void *arg) {
    (void)arg;esp_netif_ip_info_t info;
    esp_netif_t *station=esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    bool partial=false;
    if(station && esp_netif_get_ip_info(station,&info)==ESP_OK && info.ip.addr) {
        uint32_t local=ntohl(info.ip.addr),mask=ntohl(info.netmask.addr);
        uint32_t first=(local&mask)+1,last=(local&mask)|~mask;
        if(last-first>512){first=(local&0xffffff00)+1;last=(local&0xffffff00)+255;partial=true;}
        int64_t deadline=now_ms()+120000;
        for(uint32_t ip=first;ip<last;ip++) {
            LOCK();bool stop=!wifi_online || restarting || ota_in_progress || now_ms()>deadline;
            shell_scan_progress=(ip-first)*100/(last-first);UNLOCK();
            if(stop){partial=true;break;}
            if(ip==local || !meter_port_open_wait(ip,12800,900))continue;
            char host[64];snprintf(host,sizeof(host),"%u.%u.%u.%u",(unsigned)(ip>>24),(unsigned)((ip>>16)&255),(unsigned)((ip>>8)&255),(unsigned)(ip&255));
            float grid,maximum;if(shell_read_limits(host,&grid,&maximum)!=200)continue;
            LOCK();unsigned index=shell_found_count;
            if(index<4){strcpy(shell_found_host[index],host);shell_found_grid[index]=grid;shell_found_max[index]=maximum;shell_found_count++;}
            UNLOCK();
        }
    }else partial=true;
    LOCK();shell_scan_partial=partial;shell_scan_progress=100;shell_scan_running=false;UNLOCK();
    vTaskDelete(NULL);
}
static bool shell_scan_start(void) {
    LOCK();bool ready=wifi_online && !restarting && !ota_in_progress && !shell_scan_running &&
        !shelly_scan_running && !meter_preview.running && !huawei_scan_running && !huawei_preview_running;
    if(ready){shell_scan_running=true;shell_scan_progress=shell_found_count=0;shell_scan_partial=false;}UNLOCK();
    if(!ready)return false;
    if(xTaskCreate(shell_scan_task,"shell_scan",6144,NULL,3,NULL)!=pdPASS){LOCK();shell_scan_running=false;UNLOCK();return false;}
    return true;
}
static esp_err_t shell_scan_get(httpd_req_t *req) {
    cJSON *o=cJSON_CreateObject();if(!o)return send_json(req,NULL);
    LOCK();cJSON_AddBoolToObject(o,"running",shell_scan_running);cJSON_AddBoolToObject(o,"partial",shell_scan_partial);
    cJSON_AddNumberToObject(o,"progress",shell_scan_progress);cJSON *rows=cJSON_AddArrayToObject(o,"devices");
    for(unsigned i=0;i<shell_found_count;i++){
        cJSON *row=cJSON_CreateObject();cJSON_AddStringToObject(row,"host",shell_found_host[i]);
        cJSON_AddNumberToObject(row,"grid_limit_a",shell_found_grid[i]);cJSON_AddNumberToObject(row,"max_charge_a",shell_found_max[i]);cJSON_AddItemToArray(rows,row);
    }UNLOCK();return send_json(req,o);
}
static esp_err_t shell_scan_post(httpd_req_t *req) {
    if(!authorized(req))return ESP_OK;
    if(!shell_scan_start())return httpd_resp_send_err(req,HTTPD_400_BAD_REQUEST,"Suche nicht verfuegbar; WLAN oder laufende Suche pruefen.");
    return shell_scan_get(req);
}
static void shell_limits_task(void *arg) {
    (void)arg;int64_t next_read=0,next_search=0;unsigned failures=0;
    while(true) {
        LOCK();bool available=wifi_online && !restarting && !ota_in_progress;
        char host[64];strcpy(host,shell_active_host[0]?shell_active_host:settings.shell_setup_host);
        if((!host[0] || failures>=3) && shell_found_count==1){strcpy(host,shell_found_host[0]);}
        UNLOCK();
        int64_t now=now_ms();
        if(available && host[0] && now>=next_read) {
            float grid=0,maximum=0;int code=shell_read_limits(host,&grid,&maximum);
            LOCK();float capped=fminf(16,maximum);
            bool valid=code==200 && grid>=capped && capped>=settings.min_charge_a;
            shell_limits_code=valid?200:code==200?422:code;
            if(valid) {
                bool changed=settings.grid_limit_a!=grid || settings.max_charge_a!=capped;
                settings.grid_limit_a=grid;settings.max_charge_a=capped;
                settings.manual_current_a=fminf(settings.manual_current_a,capped);
                if(changed){memset(&manual_filter,0,sizeof(manual_filter));memset(&current_calibration,0,sizeof(current_calibration));}
                strcpy(shell_active_host,host);shell_grid_a=grid;shell_max_a=capped;shell_limits_at=now_ms();failures=0;
            }else failures++;
            UNLOCK();next_read=now_ms()+(valid?300000:30000);
        }
        if(available && (!host[0] || failures>=3) && now>=next_search) {
            if(shell_scan_start())next_search=now+300000;
            LOCK();if(shell_found_count==1 && strcmp(shell_found_host[0],host)){strcpy(shell_active_host,shell_found_host[0]);next_read=0;}UNLOCK();
        }
        vTaskDelay(ticks(1000));
    }
}
