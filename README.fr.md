# MyOwnRouter

[English](README.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md)

Firmware OpenWrt 25.12 (x86_64) personnalisé, conçu pour fonctionner comme machine virtuelle (Proxmox VE ou tout hôte KVM),
avec PCI passthrough d'une carte Wi-Fi et de ports Ethernet physiques libres.
Il vise à offrir, par-dessus OpenWrt, une interface web conviviale dans l'esprit des routeurs grand public, tout en gardant LuCI
disponible pour la configuration avancée.

## Fonctionnalités

Interface web servie sur `/`, qui dialogue avec `rpcd` via `/ubus` ; LuCI reste accessible sur `/cgi-bin/luci` en tant que *configuration avancée*.

Langues : **English, Español, Français, Deutsch**, à choisir sur la page de connexion ou dans la barre supérieure (par défaut, la langue du navigateur). Changer de langue une fois connecté change aussi celle de LuCI.

| Section | Contenu |
|---------|---------|
| Accueil | Vue topologique (Internet → routeur → clients), trafic WAN en direct, CPU/RAM/stockage, résumé Wi-Fi/VPN/applications |
| Internet | WAN en DHCP / IP statique / PPPoE, DNS personnalisés, MTU · répéteur Wi-Fi (recherche et connexion, WAN sans fil) · Multi-WAN en basculement ou répartition de charge (mwan3) |
| Sans fil | SSID, mot de passe, WPA2/WPA3, réseau masqué, bande, canal, largeur, puissance d'émission, isolation des clients, pays |
| Réseau invités | Réseau isolé ; sur les cartes à un seul AP, il partage le SSID avec son propre mot de passe (PPSK + VLAN) |
| Clients | Appareils connectés et déconnectés, signal Wi-Fi, trafic par client (nlbwmon), renommage, réservation d'IP, blocage d'Internet |
| VPN | Profils client WireGuard et OpenVPN (import de .conf/.ovpn), kill switch · serveur WireGuard avec codes QR · proxy transparent Tor |
| Applications | Paquets installés, AdGuard Home, DNS dynamique, partage SMB, contrôle parental par plages horaires, ZeroTier, Tailscale |
| Réseau | LAN/DHCP et baux statiques, redirection de ports, ports ouverts, administration depuis le WAN, DNS (fournisseurs prédéfinis, protection contre le rebinding, DNS du routeur forcé), UPnP, SQM (cake), IPv6, flow offloading, packet steering, IGMP snooping |
| Système | Aperçu, nom d'hôte, mise à jour du firmware depuis le navigateur (sysupgrade, en conservant la configuration), tâches planifiées, fuseau horaire/NTP, journaux, ping/traceroute/nslookup, test de débit, mot de passe administrateur, SSH, réinitialisation d'usine |

La première visite lance un court assistant (mot de passe administrateur + Wi-Fi). D'ici là, root n'a pas de mot de passe, comme dans OpenWrt d'origine.

## Remarques sur le matériel

- Testé avec une MediaTek MT7921K (RZ608, Wi-Fi 6E) et des ports Intel I226-V attribués en passthrough à une VM Proxmox VE 8.
- La MT7921 n'accepte qu'**une seule interface AP** (plus jusqu'à deux stations) : une bande à la fois, et le réseau invités est
  implémenté comme un second mot de passe sur le même SSID (WPA2 PPSK avec VLAN dynamique). Sans réseau invités, le WPA2/WPA3 est utilisé.
- Le répéteur impose à l'AP le canal du réseau amont (une seule radio).
- `iwinfo` indique environ 3 dBm de puissance d'émission sur la MT7921 ; c'est une bizarrerie de remontée du pilote, pas la puissance réelle.

## Plan réseau (valeurs par défaut)

| Rôle    | Interface                                                | Adresse              |
|---------|----------------------------------------------------------|----------------------|
| WAN     | première carte virtio (bridge de l'hyperviseur), DHCP    | fournie par l'amont  |
| LAN     | cartes physiques en passthrough + AP Wi-Fi               | 192.168.20.1/24      |
| Invités | réseau Wi-Fi isolé                                       | 192.168.21.1/24      |

Côté WAN, l'interface web et SSH ne sont accessibles que depuis des adresses sources privées (RFC1918).

## Compilation

Nécessite podman (ou docker). L'Image Builder officiel d'OpenWrt s'exécute dans un conteneur Debian :

```sh
mkdir -p build && cd build
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/x86/64/openwrt-imagebuilder-25.12.6-x86-64.Linux-x86_64.tar.zst
tar --zstd -xf openwrt-imagebuilder-*.tar.zst && cd ..
podman build -t myownrouter-builder .
podman run --rm -v "$PWD":/work:Z -w /work localhost/myownrouter-builder ./build.sh
```

L'image est générée dans `build/openwrt-imagebuilder-*/bin/targets/x86/64/*-squashfs-combined-efi.img.gz`.

## Déploiement sur Proxmox VE

Copiez l'image sur l'hôte et exécutez (l'IOMMU doit être activé) :

```sh
./proxmox/create-vm.sh openwrt-*-squashfs-combined-efi.img.gz <vmid> <bridge-wan> <pci-lan>[,<pci-lan>...] [pci-wifi]
qm start <vmid>
```

La première carte réseau (virtio, sur le bridge WAN) devient le WAN ; chaque port Ethernet attribué en passthrough rejoint le bridge LAN.

## Développement

`./dev-sync.sh <ip-du-routeur>` copie `files/` sur un routeur en fonctionnement et redémarre rpcd, ce qui permet de tester
les modifications de l'interface ou du backend sans recompiler (il ne copie ni `etc/config` ni `etc/uci-defaults`, pour ne pas
écraser la configuration réelle). Organisation :

- `files/www/` : interface web (JavaScript pur, sans étape de compilation)
- `files/usr/share/rpcd/ucode/myownrouter` : backend ubus (`ubus -v list myownrouter`)
- `files/usr/share/rpcd/acl.d/myownrouter.json` : ACL rpcd
- `files/etc/uci-defaults/` : configuration du premier démarrage
- `i18n/translations.tsv` : textes de l'interface (es → en/fr/de) ; après modification, lancez `python3 tools/build_i18n.py`
  pour régénérer `files/www/mor/i18n/*.js` (le script échoue aussi si un texte utilisé dans le code n'a pas de traduction ou si un paramètre `{0}` est perdu)

### Traductions

L'espagnol est la langue source : l'interface appelle `t('texto', ...args)`. Pour ajouter un texte, entourez-le de `t()`,
ajoutez une ligne dans `i18n/translations.tsv` et lancez le script. Pour ajouter une langue, ajoutez une colonne au TSV et son code
à `LANGS` dans `tools/build_i18n.py` et dans `files/www/mor/core.js`.

## Licence

GPL-2.0 (la même qu'OpenWrt).
