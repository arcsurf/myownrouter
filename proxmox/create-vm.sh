#!/bin/bash
# Crea la VM de MyOwnRouter en un host Proxmox VE (ejecutar en el host).
# Uso: create-vm.sh <imagen.img.gz> <vmid> <bridge-wan> <pci-lan>[,<pci-lan2>...] [pci-wifi]
# Ej.: create-vm.sh myownrouter.img.gz 125 vmbr0 0000:07:00.0 0000:02:00.0
# Requisitos: IOMMU activo (intel_iommu=on / amd_iommu=on) y cada dispositivo en su propio grupo IOMMU.
set -euo pipefail
IMG=${1:?imagen}; VMID=${2:?vmid}; BR=${3:?bridge WAN}; LAN=${4:?PCI LAN}; WIFI=${5:-}
STORAGE=${STORAGE:-local-lvm}

for dev in ${LAN//,/ } $WIFI; do
	g=$(basename "$(readlink -f /sys/bus/pci/devices/$dev/iommu_group)")
	n=$(ls /sys/kernel/iommu_groups/$g/devices | wc -l)
	[ "$n" -eq 1 ] || echo "AVISO: $dev comparte el grupo IOMMU $g con $((n-1)) dispositivo(s)"
done

tmp=$(mktemp --suffix=.img)
gunzip -c "$IMG" > "$tmp" || [ $? -eq 2 ]   # gzip avisa por el padding final de las imágenes OpenWrt

qm create "$VMID" --name myownrouter --memory 1024 --balloon 0 --cores 2 --cpu host --machine q35 --ostype l26 \
	--scsihw virtio-scsi-single --net0 "virtio,bridge=$BR" --serial0 socket --agent 1 --onboot 1
i=0
for dev in ${LAN//,/ } $WIFI; do qm set "$VMID" --hostpci$i "$dev,pcie=1" >/dev/null; i=$((i+1)); done
qm importdisk "$VMID" "$tmp" "$STORAGE" >/dev/null
qm set "$VMID" --scsi0 "$STORAGE:vm-$VMID-disk-0" --boot order=scsi0 >/dev/null
rm -f "$tmp"
echo "VM $VMID creada. Iniciala con: qm start $VMID"
echo "La WAN toma IP por DHCP en $BR; la interfaz web queda en esa IP y en http://192.168.20.1 (LAN)."
