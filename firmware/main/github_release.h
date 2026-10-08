#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
typedef struct {char version[32],url[224],sha256[65];uint32_t bytes;} github_release_t;
bool github_release_parse(const char *json,size_t maximum,github_release_t *out);
int firmware_version_compare(const char *a,const char *b);
