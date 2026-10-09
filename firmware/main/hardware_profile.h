#pragma once

/* Host-side tests have no sdkconfig and therefore exercise the standard board. */
#if defined(CONFIG_TEE_BOARD_ATOMS3_LITE) && CONFIG_TEE_BOARD_ATOMS3_LITE
#define EMS_HARDWARE_ID "andreas-testboard"
#define EMS_HARDWARE_NAME "Andreas Testboard · AtomS3 Lite"
#define EMS_DEFAULT_SHELL_TX_PIN 6
#define EMS_DEFAULT_SHELL_RX_PIN 5
#define EMS_DEFAULT_METER_TX_PIN 1
#define EMS_DEFAULT_METER_RX_PIN 2
#define EMS_DEFAULT_MODE_INPUT_PIN 1
#define EMS_OTA_ASSET_SUFFIX "-atoms3-lite"
#define EMS_FLASH_SIZE_BYTES 0x800000u
#define EMS_FLASH_SIZE_NIBBLE 0x30u
#else
#define EMS_HARDWARE_ID "esp32s3-n16r8"
#define EMS_HARDWARE_NAME "ESP32-S3 N16R8"
#define EMS_DEFAULT_SHELL_TX_PIN 17
#define EMS_DEFAULT_SHELL_RX_PIN 18
#define EMS_DEFAULT_METER_TX_PIN 4
#define EMS_DEFAULT_METER_RX_PIN 5
#define EMS_DEFAULT_MODE_INPUT_PIN 6
#define EMS_OTA_ASSET_SUFFIX ""
#define EMS_FLASH_SIZE_BYTES 0x1000000u
#define EMS_FLASH_SIZE_NIBBLE 0x40u
#endif

#define EMS_OTA_PARTITION_BYTES 0x200000u
