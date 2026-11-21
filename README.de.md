# MyOwnRouter

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch**

Angepasste OpenWrt-25.12-Firmware (x86_64), gedacht für den Betrieb als virtuelle Maschine (Proxmox VE oder ein beliebiger KVM-Host),
mit PCI-Passthrough einer WLAN-Karte und freier physischer Ethernet-Ports.
Ziel ist eine benutzerfreundliche Weboberfläche im Stil von Heimroutern auf Basis von OpenWrt; LuCI bleibt für erweiterte
Einstellungen verfügbar.

## Funktionen

Die Weboberfläche wird unter `/` ausgeliefert und spricht über `/ubus` mit `rpcd`; LuCI bleibt unter `/cgi-bin/luci` als *erweiterte Einstellungen* erreichbar.

Sprachen: **English, Español, Français, Deutsch**, wählbar auf der Anmeldeseite oder in der oberen Leiste (Standard: Sprache des Browsers). Ein Wechsel im angemeldeten Zustand stellt auch LuCI um.

| Bereich | Umfang |
|---------|--------|
| Startseite | Topologieansicht (Internet → Router → Clients), WAN-Verkehr live, CPU/RAM/Speicher, Übersicht über WLAN/VPN/Anwendungen |
| Internet | WAN per DHCP / statischer IP / PPPoE, eigene DNS-Server, MTU · WLAN-Repeater (Suchen und Verbinden, drahtloses WAN) · Multi-WAN mit Ausfallsicherung oder Lastverteilung (mwan3) |
| WLAN | SSID, Passwort, WPA2/WPA3, versteckte SSID, Band, Kanal, Kanalbreite, Sendeleistung, Client-Isolierung, Land |
| Gastnetz | Isoliertes Netz; bei Karten mit nur einem AP teilt es sich die SSID und nutzt ein eigenes Passwort (PPSK + VLAN) |
| Clients | Verbundene und getrennte Geräte, WLAN-Signal, Datenverkehr pro Client (nlbwmon), Umbenennen, IP-Reservierung, Internet sperren |
| VPN | WireGuard- und OpenVPN-Clientprofile (Import von .conf/.ovpn), Kill Switch · WireGuard-Server mit QR-Codes · transparenter Tor-Proxy |
| Anwendungen | Installierte Pakete, AdGuard Home, dynamisches DNS, SMB-Freigabe, zeitgesteuerte Kindersicherung, ZeroTier, Tailscale |
| Netzwerk | LAN/DHCP und statische Zuweisungen, Portweiterleitung, offene Ports, Verwaltungszugriff aus dem WAN, DNS (vordefinierte Anbieter, Rebinding-Schutz, Router-DNS erzwingen), UPnP, SQM (cake), IPv6, Flow Offloading, Packet Steering, IGMP-Snooping |
| System | Übersicht, Hostname, Firmware-Update im Browser (sysupgrade, Einstellungen bleiben erhalten), geplante Aufgaben, Zeitzone/NTP, Protokolle, ping/traceroute/nslookup, Geschwindigkeitstest, Administratorpasswort, SSH, Zurücksetzen auf Werkseinstellungen |

Beim ersten Aufruf startet ein kurzer Assistent (Administratorpasswort + WLAN). Bis dahin hat root kein Passwort, wie bei einem frischen OpenWrt.

## Hinweise zur Hardware

- Getestet mit einer MediaTek MT7921K (RZ608, Wi-Fi 6E) und Intel-I226-V-Ports, die per Passthrough an eine Proxmox-VE-8-VM übergeben wurden.
- Die MT7921 unterstützt nur **eine AP-Schnittstelle** (plus bis zu zwei Stationen): jeweils ein Band, und das Gastnetz ist als zweites
  Passwort für dieselbe SSID umgesetzt (WPA2-PPSK mit dynamischem VLAN). Ohne Gastnetz wird WPA2/WPA3 verwendet.
- Der Repeater zwingt den AP auf den Kanal des übergeordneten Netzes (nur ein Funkmodul).
- `iwinfo` meldet bei der MT7921 etwa 3 dBm Sendeleistung; das ist eine Eigenheit der Treiberausgabe, nicht die tatsächliche Leistung.

## Netzwerkaufbau (Standardwerte)

| Rolle | Schnittstelle                                          | Adresse                       |
|-------|--------------------------------------------------------|-------------------------------|
| WAN   | erste virtio-Netzwerkkarte (Hypervisor-Bridge), DHCP   | vom übergeordneten Netz       |
| LAN   | per Passthrough übergebene Netzwerkkarten + WLAN-AP    | 192.168.20.1/24               |
| Gast  | isoliertes WLAN                                        | 192.168.21.1/24               |

Von der WAN-Seite sind Weboberfläche und SSH nur von privaten Quelladressen (RFC1918) aus erreichbar.

## Bauen

Benötigt podman (oder docker). Der offizielle OpenWrt Image Builder läuft in einem Debian-Container:

```sh
mkdir -p build && cd build
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/x86/64/openwrt-imagebuilder-25.12.6-x86-64.Linux-x86_64.tar.zst
tar --zstd -xf openwrt-imagebuilder-*.tar.zst && cd ..
podman build -t myownrouter-builder .
podman run --rm -v "$PWD":/work:Z -w /work localhost/myownrouter-builder ./build.sh
```

Das Image landet in `build/openwrt-imagebuilder-*/bin/targets/x86/64/*-squashfs-combined-efi.img.gz`.

## Installation auf Proxmox VE

Das Image auf den Host kopieren und ausführen (IOMMU muss aktiviert sein):

```sh
./proxmox/create-vm.sh openwrt-*-squashfs-combined-efi.img.gz <vmid> <wan-bridge> <lan-pci>[,<lan-pci>...] [wlan-pci]
qm start <vmid>
```

Die erste Netzwerkkarte (virtio, an der WAN-Bridge) wird zum WAN; jeder per Passthrough übergebene Ethernet-Port kommt in die LAN-Bridge.

## Entwicklung

`./dev-sync.sh <router-ip>` kopiert `files/` auf einen laufenden Router und startet rpcd neu, sodass sich Änderungen an Oberfläche
oder Backend ohne Neubau testen lassen (`etc/config` und `etc/uci-defaults` werden nicht kopiert, damit die echte Konfiguration
nicht überschrieben wird). Aufbau:

- `files/www/`: Weboberfläche (reines JavaScript, kein Build-Schritt)
- `files/usr/share/rpcd/ucode/myownrouter`: ubus-Backend (`ubus -v list myownrouter`)
- `files/usr/share/rpcd/acl.d/myownrouter.json`: rpcd-ACL
- `files/etc/uci-defaults/`: Konfiguration beim ersten Start
- `i18n/translations.tsv`: Texte der Oberfläche (es → en/fr/de); nach Änderungen `python3 tools/build_i18n.py` ausführen, um
  `files/www/mor/i18n/*.js` neu zu erzeugen (das Skript bricht auch ab, wenn ein im Code verwendeter Text keine Übersetzung hat oder ein Platzhalter `{0}` verloren geht)

### Übersetzungen

Spanisch ist die Ausgangssprache: Die Oberfläche ruft `t('texto', ...args)` auf. Um einen Text hinzuzufügen, ihn mit `t()` umschließen,
eine Zeile in `i18n/translations.tsv` ergänzen und das Skript ausführen. Für eine neue Sprache eine Spalte in der TSV-Datei anlegen
und ihren Code in `LANGS` in `tools/build_i18n.py` und in `files/www/mor/core.js` eintragen.

## Lizenz

GPL-2.0 (wie OpenWrt).
