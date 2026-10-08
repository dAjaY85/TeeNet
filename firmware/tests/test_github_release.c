#include "github_release.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int main(void){
    const char *good="{\"tag_name\":\"v1.13\",\"draft\":false,\"prerelease\":false,\"assets\":[{\"name\":\"TeeNet-1.13-ota.bin\",\"browser_download_url\":\"https://github.com/stetastic/TeeNet/releases/download/v1.13/TeeNet-1.13-ota.bin\",\"size\":1900000,\"digest\":\"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}]}";
    github_release_t r={0};assert(github_release_parse(good,2097152,&r));assert(!strcmp(r.version,"1.13")&&r.bytes==1900000&&strlen(r.sha256)==64);
    assert(firmware_version_compare("1.13","1.9")==1&&firmware_version_compare("1.12","1.13")==-1&&firmware_version_compare("1.13","1.13")==0);
    assert(!github_release_parse(good,1800000,&r));assert(!github_release_parse("{}",2097152,&r));
    char bad[1024];strcpy(bad,good);char *p=strstr(bad,"sha256:");p[7]='z';assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"stetastic");p[0]='x';assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"ota.bin");memcpy(p,"usb.zip",7);assert(!github_release_parse(bad,2097152,&r));
    strcpy(bad,good);p=strstr(bad,"\"draft\":false");memcpy(p+8,"true ",5);assert(!github_release_parse(bad,2097152,&r));
    puts("PASS: GitHub stable release, exact repository/asset URL, firmware size, SHA256 and numeric version checks");
}
