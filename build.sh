#!/bin/bash
# Construye la imagen MyOwnRouter (OpenWrt 25.12.6 x86_64) con el Image Builder oficial.
set -euo pipefail
cd "$(dirname "$0")"
IB=build/openwrt-imagebuilder-25.12.6-x86-64.Linux-x86_64

PKGS="
 luci luci-i18n-base-es luci-i18n-firewall-es luci-app-firewall
 rpcd-mod-ucode rpcd-mod-iwinfo rpcd-mod-file ucode-mod-fs ucode-mod-uci ucode-mod-ubus
 kmod-igc kmod-mt7921e kmod-mt7921-firmware wpad-mbedtls iw wireless-regdb
 qemu-ga
 wireguard-tools kmod-wireguard luci-proto-wireguard qrencode
 openvpn-openssl luci-app-openvpn openvpn-easy-rsa
 adguardhome luci-app-adguardhome
 tailscale zerotier tor luci-app-tor
 ddns-scripts luci-app-ddns
 sqm-scripts luci-app-sqm
 luci-app-upnp
 mwan3 luci-app-mwan3
 pbr luci-app-pbr
 nlbwmon luci-app-nlbwmon
 luci-app-wol luci-app-ttyd
 ksmbd-server luci-app-ksmbd
 luci-app-package-manager
 librespeed-cli iperf3 kmod-tcp-bbr
 nano htop tcpdump-mini curl
"
rm -f "$IB/.profiles.mk"; mkdir -p "$IB/dl" "$IB/tmp"
make -C "$IB" image PROFILE=generic \
	PACKAGES="$(echo $PKGS)" \
	FILES="$PWD/files" \
	ROOTFS_PARTSIZE=1024 \
	EXTRA_IMAGE_NAME=myownrouter
ls -la "$IB"/bin/targets/x86/64/*combined-efi*
