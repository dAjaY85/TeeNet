#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* EM24-E1 manufacturer protocol, physical (zero-based) input addresses. */
#define EM24_CURRENT_START 0x000c
#define EM24_CURRENT_COUNT 6
#define EM24_POWER_START 0x0028
#define EM24_POWER_COUNT 2

typedef struct {
    float current_a[3];
    float active_power_w; /* positive import, negative export */
} em24_reading_t;

bool em24_modbus_decode(const uint8_t *currents, size_t current_length,
                       const uint8_t *power, size_t power_length, em24_reading_t *out);
