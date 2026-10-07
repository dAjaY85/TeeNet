# TeeNet 1.11

Steuerung für Shell Recharge Advanced 3.0 mit ESP32-S3 N16R8 (16 MB Flash).
Build: e531cc2efe09. Dieser Quellstand entspricht der angebotenen Firmware.

## Bauen

ESP-IDF 5.3.2 installieren und die ESP-IDF-Konsole öffnen. Im Projektordner:

    idf.py set-target esp32s3
    idf.py build

Die OTA-Datei ist build/wallbox_ems.bin. Nur diese Datei unter Update & Hilfe
am bereits eingerichteten TeeNet auswählen. Ladung vorher stoppen.
USB-Erstinstallation direkt im Browser:
https://teennet-demo.stetastic.chatgpt.site/install.html
Alternativ: idf.py -p PORT flash (PORT passend wählen).

## Einrichten

Mit Wallbox-EMS-Setup verbinden, 192.168.4.1 öffnen und den Assistenten nutzen.
Anleitung und Anschlussplan: main/guide.html und main/hardware-plan.svg.
Shell: TX17/RX18; Wallbox-Zähler: TX4/RX5; automatische 3,3-V-RS485-Module.
Optional GPIO12/14 Relais, GPIO13 Rückmeldung, GPIO6 Modus, GPIO7 EVU.

## EM24-E1 und AtomS3 Lite

EM24-E1 am Hausanschluss: Modbus TCP, Port 502, Adresse 1; drei Phasenströme
und Gesamtwirkleistung. Ein separater Zähler am Wallbox-Abgang bleibt nötig.
EM24 und AtomS3 sind softwareseitig geprüft, der Hardwaretest steht noch aus.
Bei einem Shelly-Wallbox-Zähler über Modbus TCP werden GPIO4/5 frei:
Atomic RS485 Base mit Shell TX6/RX5; den GPIO6-Betriebsartkontakt ausschalten.
Der AtomS3 Lite benötigt einen eigenen Build mit 8 MB Flash. Dieses Paket ist
für N16R8 / 16 MB. Auf Atom zunächst nur die benötigten Grundfunktionen nutzen.
Nicht benötigte Relais, Kontakte, Hausakku, Huawei und Anzeigen deaktivieren.
PSRAM ist in diesem Build nicht aktiviert; Abschalten von Optionen verkleinert
die Firmwaredatei nicht, reduziert aber die tatsächlich laufenden Aufgaben.

## Hinweis

Die Nutzung aller Funktionen dieser Software erfolgt auf eigene Gefahr,
insbesondere die Phasenumschaltung. Eingriffe in Wallbox, Fahrzeug oder andere
Komponenten können je nach Herstellerbedingungen zum Verlust von
Garantieansprüchen führen. Phasen nur stromlos umschalten; Netzanschlüsse
durch eine Elektrofachkraft ausführen.

Es sind keine Gerätesicherungen, NVS-Dumps, privaten WLAN-/MQTT-Zugangsdaten
oder persönlichen Verbrauchsaufzeichnungen enthalten.
