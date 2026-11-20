# MyOwnRouter

Custom OpenWrt 25.12 (x86_64) firmware designed to run as a virtual machine (Proxmox VE or any KVM host),
using PCI passthrough for a Wi-Fi card and spare physical Ethernet ports.
It aims to offer a friendly, consumer-router style web interface on top of OpenWrt, with LuCI still available
for advanced settings.

> Work in progress.

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

## License

GPL-2.0 (same as OpenWrt).
