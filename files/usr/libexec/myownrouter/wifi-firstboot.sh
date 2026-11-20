#!/bin/sh
# Espera la radio, genera /etc/config/wireless y deja la red principal apagada
# hasta que se complete el asistente.
# El MT7921 admite un solo AP: la red de invitados se implementa en el mismo SSID
# con una contraseña propia (PPSK) que asigna la VLAN 'guest' (ver backend).
# La clave principal también va como wifi-station: con sae_password_file
# hostapd ignora wpa_passphrase para SAE.
i=0
while [ ! -e /sys/class/ieee80211/phy0 ] && [ $i -lt 60 ]; do sleep 2; i=$((i+1)); done
[ -e /sys/class/ieee80211/phy0 ] || { logger -t myownrouter "sin radio WiFi"; exit 0; }

radio=$(uci -q show wireless | sed -n 's/^wireless\.\([^.]*\)=wifi-device$/\1/p' | head -1)
if [ -z "$radio" ]; then
	wifi config
	radio=$(uci -q show wireless | sed -n 's/^wireless\.\([^.]*\)=wifi-device$/\1/p' | head -1)
fi
[ -n "$radio" ] || exit 0

# borrar ifaces autogeneradas
for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.]*\)=wifi-iface$/\1/p'); do uci -q delete wireless.$s; done

mac=$(cat /sys/class/ieee80211/phy0/macaddress 2>/dev/null | tr -d : | tail -c 5 | tr a-f A-F)
uci -q batch <<UCI
set wireless.$radio.country='AR'
set wireless.$radio.band='5g'
set wireless.$radio.channel='auto'
set wireless.$radio.htmode='HE80'
set wireless.$radio.cell_density='0'
set wireless.$radio.disabled='0'
set wireless.main=wifi-iface
set wireless.main.device='$radio'
set wireless.main.mode='ap'
set wireless.main.network='lan'
set wireless.main.ssid='MyOwnRouter-$mac'
set wireless.main.encryption='sae-mixed'
set wireless.main.key='myownrouter-$mac'
set wireless.main.disabled='1'
set wireless.main_sta=wifi-station
set wireless.main_sta.iface='main'
set wireless.main_sta.key='myownrouter-$mac'
commit wireless
UCI
mkdir -p /etc/myownrouter && touch /etc/myownrouter/.wifi-done
wifi reload
