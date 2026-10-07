/* Flash operations run outside the control lock, batched by the status task. */
static void load_diagnostics(void) {
    diagnostic_store_init(&fault_log);nvs_handle_t handle;
    if(!config_storage_ok||nvs_open("teenet_diag",NVS_READONLY,&handle)!=ESP_OK)return;
    diagnostic_store_t *copy=malloc(sizeof(*copy));size_t size=sizeof(*copy);
    if(copy&&nvs_get_blob(handle,"faults",copy,&size)==ESP_OK)diagnostic_store_restore(&fault_log,copy,size);
    free(copy);nvs_close(handle);
}
static void save_diagnostics(bool force) {
    int64_t now=now_ms();LOCK();
    bool due=fault_dirty&&(force||now-fault_save_attempt>=300000||(fault_save_attempt==0&&now>=30000));
    UNLOCK();if(!due||!config_storage_ok)return;
    diagnostic_store_t *copy=malloc(sizeof(*copy));if(!copy)return;
    LOCK();*copy=fault_log;uint32_t revision=fault_revision;fault_save_attempt=now;UNLOCK();
    diagnostic_store_seal(copy);nvs_handle_t handle;
    esp_err_t error=nvs_open("teenet_diag",NVS_READWRITE,&handle);
    if(error==ESP_OK){error=nvs_set_blob(handle,"faults",copy,sizeof(*copy));if(error==ESP_OK)error=nvs_commit(handle);nvs_close(handle);}
    free(copy);LOCK();fault_storage_ok=error==ESP_OK;if(error==ESP_OK&&revision==fault_revision)fault_dirty=false;UNLOCK();
}
