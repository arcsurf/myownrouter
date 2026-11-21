# MyOwnRouter

[English](README.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

Firmware OpenWrt 25.12 (x86_64) personalizado, pensado para correr como máquina virtual (Proxmox VE o cualquier host KVM),
con PCI passthrough de una placa Wi-Fi y de puertos Ethernet físicos libres.
Busca ofrecer una interfaz web amigable, al estilo de los routers hogareños, sobre OpenWrt, manteniendo LuCI disponible
para la configuración avanzada.

## Funciones

Interfaz web servida en `/`, que se comunica con `rpcd` a través de `/ubus`; LuCI sigue disponible en `/cgi-bin/luci` como *configuración avanzada*.

Idiomas: **English, Español, Français, Deutsch**: se eligen en la página de inicio de sesión o en la barra superior (por defecto, el idioma del navegador). Si se cambia con la sesión iniciada, también cambia el idioma de LuCI.

| Sección | Qué incluye |
|---------|-------------|
| Inicio | Vista de topología (Internet → router → clientes), tráfico WAN en vivo, CPU/RAM/almacenamiento, resumen de Wi-Fi/VPN/aplicaciones |
| Internet | WAN por DHCP / IP estática / PPPoE, DNS personalizados, MTU · repetidor Wi-Fi (búsqueda y conexión, WAN inalámbrica) · Multi-WAN con conmutación por falla o balanceo de carga (mwan3) |
| Inalámbrico | SSID, contraseña, WPA2/WPA3, red oculta, banda, canal, ancho, potencia de transmisión, aislamiento de clientes, país |
| Red de invitados | Red aislada; en placas con un solo AP comparte el SSID con su propia contraseña (PPSK + VLAN) |
| Clientes | Dispositivos conectados y desconectados, señal Wi-Fi, tráfico por cliente (nlbwmon), renombrar, reserva de IP, bloqueo de internet |
| VPN | Perfiles de cliente WireGuard y OpenVPN (importación de .conf/.ovpn), kill switch · servidor WireGuard con códigos QR · proxy transparente Tor |
| Aplicaciones | Paquetes instalados, AdGuard Home, DNS dinámico, carpeta compartida SMB, control parental por horario, ZeroTier, Tailscale |
| Red | LAN/DHCP y reservas estáticas, reenvío de puertos, puertos abiertos, acceso de administración desde la WAN, DNS (proveedores predefinidos, protección contra rebinding, forzar el DNS del router), UPnP, SQM (cake), IPv6, flow offloading, packet steering, IGMP snooping |
| Sistema | Resumen, nombre del equipo, actualización de firmware desde el navegador (sysupgrade, conservando la configuración), tareas programadas, zona horaria/NTP, registros, ping/traceroute/nslookup, test de velocidad, contraseña de administrador, SSH, restablecimiento de fábrica |

La primera visita lanza un asistente breve (contraseña de administrador + Wi-Fi). Hasta entonces root no tiene contraseña, igual que en OpenWrt de fábrica.

## Notas de hardware

- Probado con una MediaTek MT7921K (RZ608, Wi-Fi 6E) y puertos Intel I226-V asignados por passthrough a una VM de Proxmox VE 8.
- La MT7921 admite **una sola interfaz AP** (más hasta dos estaciones): una banda por vez, y la red de invitados se implementa
  como una segunda contraseña en el mismo SSID (WPA2 PPSK con VLAN dinámica). Con la red de invitados apagada se usa WPA2/WPA3.
- El repetidor obliga al AP a usar el canal de la red superior (una sola radio).
- `iwinfo` informa unos 3 dBm de potencia en la MT7921; es una rareza del driver al reportar, no la potencia real.

## Esquema de red (valores por defecto)

| Rol       | Interfaz                                            | Dirección             |
|-----------|-----------------------------------------------------|-----------------------|
| WAN       | primera NIC virtio (bridge del hipervisor), DHCP    | de la red superior    |
| LAN       | NIC físicas asignadas por passthrough + AP Wi-Fi    | 192.168.20.1/24       |
| Invitados | red Wi-Fi aislada                                   | 192.168.21.1/24       |

Desde el lado WAN, la interfaz web y SSH solo son accesibles desde direcciones de origen privadas (RFC1918).

## Compilación

Requiere podman (o docker). El Image Builder oficial de OpenWrt se ejecuta dentro de un contenedor Debian:

```sh
mkdir -p build && cd build
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/x86/64/openwrt-imagebuilder-25.12.6-x86-64.Linux-x86_64.tar.zst
tar --zstd -xf openwrt-imagebuilder-*.tar.zst && cd ..
podman build -t myownrouter-builder .
podman run --rm -v "$PWD":/work:Z -w /work localhost/myownrouter-builder ./build.sh
```

La imagen queda en `build/openwrt-imagebuilder-*/bin/targets/x86/64/*-squashfs-combined-efi.img.gz`.

## Instalación en Proxmox VE

Copiar la imagen al host y ejecutar (IOMMU debe estar habilitado):

```sh
./proxmox/create-vm.sh openwrt-*-squashfs-combined-efi.img.gz <vmid> <bridge-wan> <pci-lan>[,<pci-lan>...] [pci-wifi]
qm start <vmid>
```

La primera NIC (virtio, en el bridge WAN) pasa a ser la WAN; cada puerto Ethernet asignado por passthrough se suma al bridge LAN.

## Desarrollo

`./dev-sync.sh <ip-del-router>` copia `files/` a un router en funcionamiento y reinicia rpcd, para probar cambios de la
interfaz o del backend sin recompilar (no copia `etc/config` ni `etc/uci-defaults`, para no pisar la configuración real). Estructura:

- `files/www/`: interfaz web (JavaScript puro, sin paso de compilación)
- `files/usr/share/rpcd/ucode/myownrouter`: backend ubus (`ubus -v list myownrouter`)
- `files/usr/share/rpcd/acl.d/myownrouter.json`: ACL de rpcd
- `files/etc/uci-defaults/`: configuración del primer arranque
- `i18n/translations.tsv`: textos de la interfaz (es → en/fr/de); después de editarlo, ejecutar `python3 tools/build_i18n.py`
  para regenerar `files/www/mor/i18n/*.js` (también falla si un texto usado en el código no tiene traducción o si se pierde un placeholder `{0}`)

### Traducciones

El español es el idioma fuente: la interfaz llama a `t('texto', ...args)`. Para agregar un texto, envolverlo con `t()`,
agregar una fila en `i18n/translations.tsv` y ejecutar el script. Para agregar un idioma, sumar una columna al TSV y su código
a `LANGS` en `tools/build_i18n.py` y en `files/www/mor/core.js`.

## Licencia

GPL-2.0 (la misma que OpenWrt).
