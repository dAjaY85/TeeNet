# TeeNet 1.6 – Probelauf am Ersatz-ESP

**Ergebnis: Alle sechs Stufen sowie beide Phasenwechsel bestanden. Ladung anschließend gestoppt, Relais aus, Rückmeldung dreiphasig.**

6. Oktober 2026, 13:28–13:45 Uhr (Europe/Berlin). Firmware-Build afd59623e822. Relais GPIO12 Active Low; GPIO13 mit Öffner, geschlossen gegen GND = dreiphasig.

| Schritt | Phasen | Soll | Ist-Mittel, letzte 30 s | Danach durchgehend innerhalb ±5 % | Spitzenwert |
|---|---:|---:|---:|---:|---:|
| 1 | 3 | 6,50 kW | 6,70 kW | 80,20 s | 10,80 kW |
| 2 | 3 | 9,00 kW | 9,08 kW | 41,55 s | 10,79 kW |
| 3 | 3 | 6,50 kW | 6,70 kW | 31,86 s | 9,08 kW |
| 4 | 1 | 2,50 kW | 2,53 kW | 146,76 s | 3,59 kW |
| 5 | 1 | 3,50 kW | 3,52 kW | 19,73 s | 3,60 kW |
| 6 | 3 | 6,50 kW | 6,70 kW | 96,05 s | 10,80 kW |

## Phasenwechsel

| Wechsel | Strom unter 1 A erstmals gemessen | Relais und Stellung bestätigt | Nach Pause ladebereit | Ladestrom wieder vorhanden |
|---|---:|---:|---:|---:|
| 3 → 1 | 6,50 s | 19,30 s | 22,48 s | 57,36 s |
| 1 → 3 | 9,91 s | 19,47 s | 25,86 s | 44,89 s |

Zeitangaben ab jeweiligem Befehl. Status wurde etwa alle 3 Sekunden abgerufen; die mechanische Schaltzeit ist damit nicht separat auflösbar. Relaisänderungen waren nur mit frischer Messung unter 1 A sichtbar. Die Software wartet mindestens 8 Sekunden stromlos und danach mindestens 5 Sekunden auf Stabilisierung.

## Beobachtungen

- Kein ungeplanter Ladeabbruch, kein ESP-Neustart und keine RS485-Unterbrechung im vollständigen Durchlauf. Wiederanlaufsperre blieb aus.
- Beim ersten Start und der Erhöhung auf 9 kW stieg die Leistung kurz auf knapp 11 kW. Beim Wiederanlauf einphasig wurden kurz etwa 3,6 kW erreicht.
- Dreiphasig 6,5 kW wurde wiederholt mit etwa 6,70 kW erreicht; 9 kW mit 9,08 kW. Einphasig wurden 2,53 und 3,52 kW erreicht.
- Im einphasigen Betrieb wurden L2 und L3 gegenüber der Shell mit null gemeldet.
- Leistung aus Xemex-Strom × 230 V × bestätigter Phasenzahl geschätzt. Eine Messzange misst L1; L2/L3 sind keine unabhängigen Strommessungen.
- WLAN während des Durchlaufs etwa −86 bis −90 dBm. Kein Übertragungsabbruch in diesem Durchlauf, Empfang bleibt schwach.
- PV-Wolkenverhalten, Mindestleistungs-Dauertest und Betrieb ohne Rückmeldekontakt wurden hier nicht erneut geprüft.

Der vorangegangene Startversuch ohne fließenden Ladestrom wurde separat abgebrochen. Seine vorübergehende Shell-Unterspannungsmeldung war vor dem erfolgreichen Durchlauf verschwunden.


## Abschlusstest nach dem Oberflächen-Update

6. Oktober 2026, 14:31–14:32 Uhr. Installierter Build b914698c0bd6, weiterhin TeeNet 1.6. Die vollständige Messreihe oben lief mit dem dort genannten vorherigen Build.

Die finale Fassung wurde zusätzlich auf das Abschalten im PV-Modus während einer laufenden Phasenhaltezeit geprüft: Einphasig 2,5 kW angefordert, nach Beginn des Stromflusses bewusst gestoppt und dabei PV gewählt. Die Ladung wurde nicht erneut freigegeben. Nach etwa 6,45 Sekunden lag der gemessene Strom unter 1 A; nach etwa 15,89 Sekunden waren Relais aus und die dreiphasige Stellung bestätigt. Nach etwa 22,19 Sekunden war die abschließende Prüfung beendet. Die zusätzliche fünfminütige Haltezeit für automatische PV-Phasenwechsel verzögerte diesen Stopp nicht.

Start und anschließender Stopp wurden im Abschlusstest durch das Testprogramm ausgelöst. Kein ungeplanter Wiederanlauf und kein registrierter Ladeabbruch. Anschließend zweimal lesend bestätigt: Ladung aus, 0 W, Relais aus, Rückmeldung dreiphasig, Xemex und Shell erreichbar.
