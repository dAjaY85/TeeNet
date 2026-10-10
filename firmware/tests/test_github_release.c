#include "github_release.h"
#include "hardware_profile.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int main(void){
    char good[1024];snprintf(good,sizeof(good),"{\"tag_name\":\"v1.13\",\"draft\":false,\"prerelease\":false,\"assets\":[{\"name\":\"TeeNet-1.13%s-ota.bin\",\"browser_download_url\":\"https://github.com/stetastic/TeeNet/releases/download/v1.13/TeeNet-1.13%s-ota.bin\",\"size\":1900000,\"digest\":\"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}]}",EMS_OTA_ASSET_SUFFIX,EMS_OTA_ASSET_SUFFIX);
    github_release_t r={0};assert(github_release_parse(good,2097152,&r));assert(!strcmp(r.version,"1.13")&&r.bytes==1900000&&strlen(r.sha256)==64);
    char manifest[1400];snprintf(manifest,sizeof(manifest),"{\"version\":\"1.17\",\"files\":[{\"name\":\"TeeNet-1.17%s-ota.bin\",\"bytes\":1900000,\"sha256\":\"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}],\"profiles\":{\"%s\":{\"ota\":\"TeeNet-1.17%s-ota.bin\"}}}",EMS_OTA_ASSET_SUFFIX,EMS_HARDWARE_ID,EMS_OTA_ASSET_SUFFIX);
    memset(&r,0,sizeof(r));assert(github_release_parse(manifest,2097152,&r));assert(!strcmp(r.version,"1.17")&&r.bytes==1900000&&strlen(r.sha256)==64);
    assert(strstr(r.url,"/releases/download/v1.17/TeeNet-1.17")!=NULL);
    assert(!github_release_parse(manifest,1800000,&r));
    assert(firmware_version_compare("1.13","1.9")==1&&firmware_version_compare("1.12","1.13")==-1&&firmware_version_compare("1.13","1.13")==0);
    assert(!github_release_parse(good,1800000,&r));assert(!github_release_parse("{}",2097152,&r));
    char bad[1024];strcpy(bad,good);char *p=strstr(bad,"sha256:");p[7]='z';assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"stetastic");p[0]='x';assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"ota.bin");memcpy(p,"usb.zip",7);assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"\"draft\":false");memcpy(p+8,"true ",5);assert(!github_release_parse(bad,2097152,&r));
    puts("PASS: GitHub stable release, exact repository/asset URL, firmware size, SHA256 and numeric version checks");
}
