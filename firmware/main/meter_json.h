#pragma once
#include <stdbool.h>
#include <stddef.h>
bool shell_limits_parse(const char *body,float *grid_a,float *max_a);
bool house_power_is_url(const char *selector);
bool house_query_url(const char *type, const char *host, const char *selector, char *url, size_t capacity);
bool house_power_parse(const char *body, const char *type, const char *path, float *watts);
