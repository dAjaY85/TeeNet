#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define EMS_FIRMWARE_PREFIX 288
/* Checks identity only. esp_ota_end still verifies the complete image. */
bool firmware_prefix_check(const uint8_t *data, size_t size, char version[32]);
