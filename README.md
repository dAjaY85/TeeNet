# TeeNet 1.11

Lokale ESP32-S3-Steuerung für die **Shell Recharge Advanced 3.0**.

[Online-Demo](https://teennet-demo.stetastic.chatgpt.site/) · [Bebilderte Anleitung](https://teennet-demo.stetastic.chatgpt.site/help) · [Downloads](https://teennet-demo.stetastic.chatgpt.site/downloads) · [USB-Webinstaller](https://teennet-demo.stetastic.chatgpt.site/install.html)

## Funktionen

- Manuell laden oder PV-Überschuss nutzen; webbasierte Einrichtung und Bedienung.
- MQTT für ioBroker und Home Assistant; je nach Hardware Shelly, Tasmota/Wattwächter, Xemex, Eastron oder Huawei und EM24-E1 Modbus TCP.
- Optionale Hausakku-Nutzung, Wolkenpuffer, Ladeplan und Phasenumschaltung.
- Verbrauch, Sitzungen, getrennte Netz-/Solarkosten, CSV-Export und OTA-Updates.
- Ein gemeinsamer Start/Stopp-Knopf und eine dauerhaft sichtbare Statuszeile.
- PV-Ladepriorität mit Hausakku-/Auto-Vorrang oder anteiliger Aufteilung.
- Diagnoseprotokoll und Firmwareprüfung; begrenzte Netzwerkabfragen entlasten den ESP.

Der USB-Webinstaller dient der Erstinstallation und löscht vorhandene Daten. Eingerichtete Geräte per OTA aktualisieren. Die Online-Demo arbeitet ohne Hardware.

## Hardware

ESP32-S3 N16R8 (16 MB Flash) und zwei automatische RS485-Wandler mit 3,3-V-Logik. USB-Versorgung. Ein Bus zur Shell, der zweite zum externen Wallbox-Zähler. Die HTTP-Messanzeige der Shell wird nicht als Regelquelle genutzt.

Der Hager ESC441 ist nur ein Beispiel für einen Schütz mit vier Öffnern. Bei der optionalen Phasenumschaltung unterbrechen zwei Öffner L2 und L3; L1, N und PE bleiben verbunden. Andere geeignete Modelle sind möglich. Spulenspannung, Belastbarkeit und Rückmeldung müssen passen. Siehe die bebilderte Anleitung.

Der getestete Regelbereich dieses Aufbaus beträgt dreiphasig 5,5–11 kW und einphasig 2,0–3,5 kW. Er ist nicht als universelle Mindestleistung aller Fahrzeuge oder Wallboxen zu verstehen. Die Shell muss für externes dynamisches Lastmanagement eingerichtet sein.

`Probelauf.md` enthält das historische Messprotokoll des erprobten Aufbaus; es ist keine allgemeine Kompatibilitätsgarantie.

## Hinweis

**Nutzung auf eigene Gefahr.** Das gilt für alle Funktionen dieser Software, insbesondere die Phasenumschaltung. Eingriffe in Wallbox, Fahrzeug oder andere Komponenten können je nach Herstellerbedingungen zum Verlust von Garantieansprüchen führen. Phasen nur stromlos umschalten; Netzanschlüsse durch eine Elektrofachkraft ausführen.
