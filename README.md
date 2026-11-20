# MyOwnRouter

Custom OpenWrt 25.12 (x86_64) firmware designed to run as a virtual machine (Proxmox VE or any KVM host),
using PCI passthrough for a Wi-Fi card and spare physical Ethernet ports.
It aims to offer a friendly, consumer-router style web interface on top of OpenWrt, with LuCI still available
for advanced settings.

## Features

Web UI (Spanish) served at `/`, talking to `rpcd` over `/ubus`; LuCI stays available at `/cgi-bin/luci` as *advanced settings*.

| Area | What you get |
|------|--------------|
| Home | Topology view (Internet → router → clients), live WAN traffic, CPU/RAM/storage, Wi-Fi/VPN/apps summary |
| Internet | DHCP / static / PPPoE WAN, custom DNS, MTU · Wi-Fi repeater (scan + connect, wireless WAN) · Multi-WAN failover / load balance (mwan3) |
| Wireless | SSID, password, WPA2/WPA3, hidden, band, channel, width, TX power, client isolation, country |
| Guest network | Isolated network; on single-AP cards it shares the SSID with its own password (PPSK + VLAN) |
| Clients | Online/offline devices, Wi-Fi signal, traffic per client (nlbwmon), rename, IP reservation, block internet |
| VPN | WireGuard and OpenVPN client profiles (import .conf/.ovpn), kill switch · WireGuard server with QR codes · Tor transparent proxy |
| Applications | Installed packages, AdGuard Home, Dynamic DNS, SMB share, parental control schedules, ZeroTier, Tailscale |
| Network | LAN/DHCP and static leases, port forwarding, open ports, WAN management access, DNS (presets, rebind protection, force router DNS), UPnP, SQM (cake), IPv6, flow offloading, packet steering, IGMP snooping |
| System | Overview, hostname, firmware upgrade from the browser (sysupgrade, keep settings), scheduled tasks, time zone/NTP, logs, ping/traceroute/nslookup, speed test, admin password, SSH, factory reset |

The first visit runs a short wizard (admin password + Wi-Fi). Until then root has no password, as in stock OpenWrt.

## Hardware notes

- Tested with a MediaTek MT7921K (RZ608, Wi-Fi 6E) and Intel I226-V ports passed through to a Proxmox VE 8 VM.
- MT7921 allows only **one AP interface** (plus up to two stations): one band at a time, and the guest network is implemented
  as a second password on the same SSID (WPA2 PPSK with dynamic VLAN). With guest access off the network uses WPA2/WPA3.
- The repeater forces the AP onto the upstream channel (single radio).
- `iwinfo` reports ~3 dBm TX power on MT7921; that is a driver reporting quirk, not the real output power.

## Network layout (defaults)

| Role  | Interface                                   | Address           |
|-------|---------------------------------------------|-------------------|
| WAN   | first virtio NIC (hypervisor bridge), DHCP  | from upstream     |
| LAN   | physical NICs passed through + Wi-Fi AP     | 192.168.20.1/24   |
| Guest | isolated Wi-Fi network                      | 192.168.21.1/24   |

The web UI and SSH are reachable from the WAN side only from private (RFC1918) source addresses.

## Build

Requires podman (or docker). The official OpenWrt Image Builder runs inside a Debian container:

```sh
mkdir -p build && cd build
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/x86/64/openwrt-imagebuilder-25.12.6-x86-64.Linux-x86_64.tar.zst
tar --zstd -xf openwrt-imagebuilder-*.tar.zst && cd ..
podman build -t myownrouter-builder .
podman run --rm -v "$PWD":/work:Z -w /work localhost/myownrouter-builder ./build.sh
```

The image is written to `build/openwrt-imagebuilder-*/bin/targets/x86/64/*-squashfs-combined-efi.img.gz`.

## Deploy on Proxmox VE

Copy the image to the host and run (IOMMU must be enabled):

```sh
./proxmox/create-vm.sh openwrt-*-squashfs-combined-efi.img.gz <vmid> <wan-bridge> <lan-pci>[,<lan-pci>...] [wifi-pci]
qm start <vmid>
```

The first NIC (virtio, on the WAN bridge) becomes WAN; every passed-through Ethernet port joins the LAN bridge.

## Development

`./dev-sync.sh <router-ip>` copies `files/` to a running router and restarts rpcd, so UI/backend changes can be tested
without rebuilding. Layout:

- `files/www/` — web UI (vanilla JS, no build step)
- `files/usr/share/rpcd/ucode/myownrouter` — ubus backend (`ubus -v list myownrouter`)
- `files/usr/share/rpcd/acl.d/myownrouter.json` — rpcd ACL
- `files/etc/uci-defaults/` — first-boot configuration

## License

GPL-2.0 (same as OpenWrt).
