# TeeNet 1.12

Quellcode für Shell Recharge Advanced 3.0 mit ESP32-S3 N16R8 (16 MB Flash).
Firmware-Build: `4f4aef6ded31`.

## Bauen

ESP-IDF 5.3.2 installieren und die ESP-IDF-Konsole öffnen. Im Projektordner:

    idf.py set-target esp32s3
    idf.py build

Die OTA-Datei `build/wallbox_ems.bin` unter **Update & Hilfe** am eingerichteten TeeNet auswählen. Ladung vorher stoppen.

Erstinstallation über den [USB-Webinstaller](https://teennet-demo.stetastic.chatgpt.site/install.html) oder mit `idf.py -p PORT flash` (`PORT` ersetzen).

## Einrichten

Mit **Wallbox-EMS-Setup** verbinden, `192.168.4.1` öffnen und den Einrichtungsassistenten nutzen.

Standardanschlüsse: Shell TX17/RX18, Wallbox-Zähler TX4/RX5, automatische RS485-Module mit 3,3-V-Logik. Erweiterungen und Verdrahtung stehen in der [Anleitung](main/guide.html) und im [Anschlussplan](main/hardware-plan.svg).

## EM24-E1 und AtomS3 Lite

Der EM24-E1 liefert drei Phasenströme und Gesamtwirkleistung über Modbus TCP (Port 502, Adresse 1). Er kann am Wallbox-Abgang oder am Hausanschluss eingesetzt werden; beide Messstellen benötigen eigene Zähler.

Bei einem Shelly- oder EM24-E1-Wallbox-Zähler über Modbus TCP werden GPIO4/5 frei. Für die Atomic RS485 Base Shell TX6/RX5 wählen und den Betriebsartkontakt auf GPIO6 deaktivieren.

**AtomS3 Lite benötigt einen eigenen 8-MB-Build.** Die angebotenen Binärdateien sind für N16R8 / 16 MB. PSRAM ist im aktuellen Build nicht aktiviert. EM24-E1 und AtomS3 Lite sind noch nicht an echter Hardware geprüft; Tests und Feedback sind willkommen.

## Hinweis

Die Nutzung aller Funktionen dieser Software erfolgt auf eigene Gefahr,
insbesondere die Phasenumschaltung. Eingriffe in Wallbox, Fahrzeug oder andere
Komponenten können je nach Herstellerbedingungen zum Verlust von
Garantieansprüchen führen. Phasen nur stromlos umschalten; Netzanschlüsse
durch eine Elektrofachkraft ausführen.
