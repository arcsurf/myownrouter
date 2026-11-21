/* MyOwnRouter web UI — home, internet, wireless, clients. SPDX-License-Identifier: GPL-2.0-only */
'use strict';

/* ================================================================== Home */

page('/home', t('Inicio'), async () => {
	const nInternet = h('div', { class: 'node', onclick: () => { location.hash = '#/internet'; } });
	const nRouter = h('div', { class: 'node', onclick: () => { location.hash = '#/system'; } });
	const nClients = h('div', { class: 'node', onclick: () => { location.hash = '#/clients'; } });
	const l1 = h('div', { class: 'link' }), l2 = h('div', { class: 'link' });
	const topo = h('div', { class: 'topo' }, nInternet, l1, nRouter, l2, nClients);

	const wifiBody = h('div'), vpnBody = h('div'), sysBody = h('div'), trafBody = h('div'), appsBody = h('div'), lanBody = h('div');
	const canvas = h('canvas', { class: 'spark' });
	const hist = { rx: [], tx: [] };
	let prev = null;

	const meter = (label, used, total, txt) => {
		const pct = total ? Math.min(100, used / total * 100) : 0;
		return h('div', { class: 'meter' }, h('div', { class: 'lbl' }, h('span', label), h('span', txt || pct.toFixed(0) + ' %')),
			h('div', { class: 'bar' }, h('i', { style: { width: pct + '%', background: pct > 85 ? 'var(--err)' : pct > 65 ? 'var(--warn)' : '' } })));
	};

	function draw() {
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth || 300, ht = canvas.clientHeight || 90;
		canvas.width = w * dpr; canvas.height = ht * dpr;
		const c = canvas.getContext('2d');
		c.scale(dpr, dpr);
		const max = Math.max(1, ...hist.rx, ...hist.tx);
		const line = (arr, color, fill) => {
			if (arr.length < 2) return;
			c.beginPath();
			arr.forEach((v, i) => {
				const x = i / 59 * w, y = ht - 4 - v / max * (ht - 10);
				i ? c.lineTo(x, y) : c.moveTo(x, y);
			});
			c.strokeStyle = color; c.lineWidth = 2; c.stroke();
			c.lineTo((arr.length - 1) / 59 * w, ht); c.lineTo(0, ht); c.closePath();
			c.fillStyle = fill; c.fill();
		};
		line(hist.rx, '#0f9d8f', 'rgba(15,157,143,.10)');
		line(hist.tx, '#6366f1', 'rgba(99,102,241,.08)');
	}

	async function update() {
		const s = await api('status');
		MOR.state.status = s;
		const inet = s.internet;
		const viaRep = inet.wwan && inet.wwan.up && !(inet.wan && inet.wan.up);
		const w = (inet.wan && inet.wan.up) ? inet.wan : inet.wwan;
		nInternet.classList.toggle('off', !inet.online);
		l1.classList.toggle('off', !inet.online);
		nInternet.replaceChildren(h('div', { class: 'big' }, icon('globe')), h('h3', t('Internet')),
			inet.online ? badge(t('Conectado'), 'ok') : badge(w && w.up ? t('Sin acceso a internet') : t('Desconectado'), 'err'),
			h('div', { class: 'small muted', style: { marginTop: '10px', lineHeight: 1.6 } },
				w ? [h('div', (viaRep ? t('Repetidor') : t('Cable')) + t(' · ') + ({ dhcp: 'DHCP', static: t('IP estática'), pppoe: 'PPPoE' }[w.proto] || w.proto)),
					h('div', 'IP ' + (w.ipaddr || '—')), h('div', t('Puerta de enlace {0}', w.gateway || '—'))] : t('Sin WAN')));
		nRouter.replaceChildren(h('div', { class: 'big' }, icon('router')), h('h3', s.system.hostname || t('Router')),
			badge(t('Activo {0}', fmtUptime(s.system.uptime)), 'info'),
			h('div', { class: 'small muted', style: { marginTop: '10px', lineHeight: 1.6 } },
				h('div', 'LAN ' + (s.lan && s.lan.ipaddr || '—')),
				h('div', 'CPU ' + (s.system.load[0] * 100 / (s.system.cpus || 1)).toFixed(0) + ' % · RAM ' +
					((1 - s.system.memory.available / s.system.memory.total) * 100).toFixed(0) + ' %')));
		l2.classList.toggle('off', !s.clients);
		nClients.replaceChildren(h('div', { class: 'big' }, icon('users')), h('h3', t('Clientes')),
			h('div', { class: 'stat-big' }, String(s.clients)),
			h('div', { class: 'small muted' }, s.wifi.present ? t('{0} por WiFi', s.wifi.clients) : t('conectados')));

		const wf = s.wifi;
		wifiBody.replaceChildren(!wf.present ? note(t('No se detectó ninguna placa WiFi.')) : h('div',
			kv([[t('Estado'), wf.enabled ? badge(t('Encendida'), 'ok') : badge(t('Apagada'))],
				[t('Red'), wf.ssid], [t('Banda'), t('{0} · canal {1} · {2}', bandName(wf.band), t(wf.channel === 'auto' ? 'auto' : wf.channel), wf.htmode)],
				[t('Invitados'), wf.guest_enabled ? badge(t('Activa'), 'ok') : badge(t('Inactiva'))],
				[t('Repetidor'), wf.repeater && wf.repeater.enabled ? wf.repeater.ssid : t('No')],
				[t('Clientes WiFi'), String(wf.clients)]])));

		vpnBody.replaceChildren(s.vpn.length
			? h('div', s.vpn.map(v => h('div', { class: 'inline', style: { marginBottom: '8px' } }, h('span', { class: 'dot ok' }), h('b', v.name), badge(v.type === 'wireguard' ? 'WireGuard' : 'OpenVPN', 'info'))))
			: h('div', { class: 'muted' }, t('No hay ningún cliente VPN conectado.')),
			h('div', { class: 'chips', style: { marginTop: '12px' } },
				badge(t('Servidor WireGuard: {0}', s.apps.wgserver ? t('activo') : t('apagado')), s.apps.wgserver ? 'ok' : ''),
				badge('Tor: ' + (s.apps.tor ? t('activo') : t('apagado')), s.apps.tor ? 'ok' : '')));

		appsBody.replaceChildren(h('div', { class: 'chips' },
			[['AdGuard Home', s.apps.adguard, '/adguard'], ['Tailscale', s.apps.tailscale, '/tailscale'], ['ZeroTier', s.apps.zerotier, '/zerotier']]
				.map(([n, on, p]) => h('a', { href: '#' + p }, badge((on ? '● ' : '○ ') + n, on ? 'ok' : '')))));

		const m = s.system.memory;
		sysBody.replaceChildren(
			meter(t('CPU (carga 1 min)'), s.system.load[0], s.system.cpus || 1, s.system.load.map(x => x.toFixed(2)).join(t(' · '))),
			meter(t('Memoria'), m.total - m.available, m.total, fmtBytes(m.total - m.available) + ' / ' + fmtBytes(m.total)),
			meter(t('Almacenamiento'), s.system.storage.used, s.system.storage.total, fmtBytes(s.system.storage.used) + ' / ' + fmtBytes(s.system.storage.total)),
			h('div', { class: 'small muted' }, s.system.model + (s.system.temp ? t(' · ') + s.system.temp.toFixed(0) + ' °C' : '')));

		lanBody.replaceChildren(kv([['LAN', (s.lan && s.lan.ipaddr) + ' /' + (s.lan && s.lan.mask)],
			[t('Invitados'), s.guest ? s.guest.ipaddr + ' /' + s.guest.mask : '—'],
			[t('DNS WAN'), (w && w.dns || []).join(', ') || '—']]));

		if (w) {
			const now = Date.now();
			if (prev && prev.dev === w.device) {
				const dt = (now - prev.t) / 1000;
				hist.rx.push(Math.max(0, (w.rx_bytes - prev.rx) / dt));
				hist.tx.push(Math.max(0, (w.tx_bytes - prev.tx) / dt));
				if (hist.rx.length > 60) { hist.rx.shift(); hist.tx.shift(); }
			}
			prev = { t: now, rx: w.rx_bytes, tx: w.tx_bytes, dev: w.device };
			trafBody.replaceChildren(h('div', { class: 'inline', style: { marginBottom: '8px' } },
				h('span', { style: { color: '#0f9d8f' } }, icon('down'), ' ', fmtRate(hist.rx[hist.rx.length - 1] || 0)),
				h('span', { style: { color: '#6366f1' } }, icon('up'), ' ', fmtRate(hist.tx[hist.tx.length - 1] || 0)),
				h('span', { class: 'muted small', style: { marginLeft: 'auto' } }, t('Total ↓ {0} · ↑ {1}', fmtBytes(w.rx_bytes), fmtBytes(w.tx_bytes)))), canvas);
			draw();
		}
	}

	every(3000, () => update().catch(() => {}));
	return [topo,
		h('div', { class: 'grid c3', style: { marginTop: '18px' } },
			card(t('Tráfico WAN'), trafBody, null, { style: { gridColumn: 'span 2' } }),
			card(t('Sistema'), sysBody),
			card('WiFi', wifiBody, h('a', { href: '#/wireless' }, t('Configurar'))),
			card('VPN', vpnBody, h('a', { href: '#/vpn' }, t('Ver'))),
			card(t('Red'), h('div', lanBody, h('div', { style: { marginTop: '14px' } }, appsBody)), h('a', { href: '#/lan' }, t('Configurar'))))];
});

/* ================================================================== Internet */

page('/internet', t('Internet · Conexión'), async () => {
	const [wan, st] = await Promise.all([uci.get('network', 'wan'), api('status')]);
	const live = st.internet.wan || {};
	const proto = select([['dhcp', t('DHCP (automático)')], ['static', t('IP estática')], ['pppoe', 'PPPoE']], wan.proto);
	const ip = input(wan.ipaddr), mask = input(wan.netmask || '255.255.255.0'), gw = input(wan.gateway);
	const user = input(wan.username), pass = password(wan.password);
	const mtu = input(wan.mtu, { type: 'number', placeholder: '1500' });
	const hostname = input(wan.hostname, { placeholder: 'myownrouter' });
	const dnsCustom = toggle(wan.peerdns === '0');
	const dns = input((wan.dns || []).join(' '), { placeholder: '1.1.1.1 9.9.9.9' });
	const staticBox = h('div', { class: 'form' }, field(t('Dirección IP'), ip), field(t('Máscara'), mask), field(t('Puerta de enlace'), gw));
	const pppBox = h('div', { class: 'form' }, field(t('Usuario'), user), field(t('Contraseña'), pass));
	const dhcpBox = h('div', { class: 'form' }, field(t('Nombre de host'), hostname, t('Se envía al servidor DHCP de la red superior')));
	const dnsRow = field(t('Servidores DNS'), dns, t('Separados por espacio'));
	const sync = () => {
		staticBox.style.display = proto.value === 'static' ? '' : 'none';
		pppBox.style.display = proto.value === 'pppoe' ? '' : 'none';
		dhcpBox.style.display = proto.value === 'dhcp' ? '' : 'none';
		dnsRow.style.display = dnsCustom.checked || proto.value === 'static' ? '' : 'none';
	};
	proto.addEventListener('change', sync);
	dnsCustom.input.addEventListener('change', sync);
	sync();

	const save = async () => {
		const p = proto.value;
		const v = { proto: p, mtu: mtu.value, peerdns: p !== 'static' && dnsCustom.checked ? '0' : '',
			dns: (dnsCustom.checked || p === 'static') ? dns.value.split(/[ ,]+/).filter(Boolean) : [],
			ipaddr: p === 'static' ? ip.value : '', netmask: p === 'static' ? mask.value : '', gateway: p === 'static' ? gw.value : '',
			username: p === 'pppoe' ? user.value : '', password: p === 'pppoe' ? pass.value : '',
			hostname: p === 'dhcp' ? hostname.value : '' };
		if (p === 'static' && (!ip.value || !gw.value)) throw new Error(t('Completá IP y puerta de enlace'));
		const viaWan = location.hostname === live.ipaddr;
		if (viaWan && !(await confirmDlg(t('Cambiar la conexión WAN'), t('Estás conectado al router por su IP WAN ({0}). Si cambia, vas a tener que entrar por la nueva dirección o por la LAN.', live.ipaddr), t('Aplicar')))) return;
		await uci.save('network', 'wan', v, 'network');
		toast('Conexión WAN actualizada', 'ok');
	};

	return [
		card(t('Estado'), kv([
			[t('Estado'), live.up ? badge(t('Conectada'), 'ok') : badge(t('Desconectada'), 'err')],
			[t('Internet'), st.internet.online ? badge(t('Accesible'), 'ok') : badge(t('Sin acceso'), 'err')],
			[t('Interfaz'), (live.device || '—') + (live.mac ? t(' · ') + live.mac : '')],
			[t('Dirección IP'), live.ipaddr ? live.ipaddr + ' /' + live.mask : '—'],
			[t('Puerta de enlace'), live.gateway], ['DNS', (live.dns || []).join(', ') || '—'],
			[t('Tiempo conectado'), live.uptime ? fmtUptime(live.uptime) : '—']])),
		card(t('Configuración del puerto WAN'), h('div', { class: 'form' },
			field(t('Tipo de conexión'), proto), dhcpBox, staticBox, pppBox,
			field(t('DNS personalizados'), dnsCustom, t('Ignorar los DNS que entrega la red superior')), dnsRow,
			field('MTU', mtu, t('Vacío = automático')),
			note(t('En la VM, el puerto WAN es la NIC virtual conectada al bridge del hipervisor. Si la red superior ya hace NAT (doble NAT), para publicar servicios hay que reenviar los puertos también en ese router.')),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), save, 'primary'))))];
});

/* ================================================================== Repeater */

page('/repeater', t('Internet · Repetidor'), async () => {
	const [w, st] = await Promise.all([api('wifi_get'), api('status')]);
	if (!w.present) return card(t('Repetidor'), note(t('No hay placa WiFi.')));
	const rep = w.repeater;
	const ww = st.internet.wwan;
	const results = h('div');

	const connectTo = async (n) => {
		const key = password('');
		const ok = await modal(t('Conectar a «{0}»', n.ssid), h('div', { class: 'form' },
			kv([[t('Banda'), t('{0} · canal {1}', bandName(n.band), n.channel)], [t('Señal'), n.signal + ' dBm'], [t('Seguridad'), n.encryption]]),
			n.encryption !== 'none' ? field(t('Contraseña'), key) : null,
			note(t('Este WiFi tiene una sola radio: tu red se va a mover a la banda y al canal de la red repetida, y los clientes WiFi se reconectan.'), 'warn')),
		[[t('Cancelar'), null], [t('Conectar'), async () => {
			if (n.encryption !== 'none' && key.value.length < 8) { toast('Contraseña inválida', 'err'); return false; }
			await api('repeater_set', { enabled: true, ssid: n.ssid, key: key.value, encryption: n.encryption, band: n.band, bssid: '' });
			return true;
		}, 'primary']]);
		if (ok) { toast('Conectando… puede tardar hasta 30 segundos', 'ok'); setTimeout(navigate, 25000); }
	};

	const scan = async () => {
		results.replaceChildren(h('div', { class: 'muted' }, t('Buscando redes…')));
		const r = await api('wifi_scan');
		const seen = new Set();
		const rows = r.results.filter(n => { const k = n.ssid + n.band; if (seen.has(k)) return false; seen.add(k); return n.ssid !== w.ssid; }).map(n => [
			h('b', n.ssid), bandName(n.band) + t(' · ') + n.channel,
			h('span', { class: 'inline' }, h('span', { class: 'dot ' + (n.signal > -65 ? 'ok' : n.signal > -78 ? 'warn' : 'err') }), n.signal + ' dBm'),
			n.encryption === 'none' ? badge(t('Abierta'), 'warn') : badge(n.encryption.toUpperCase().replace('-MIXED', ' mixto').replace('PSK2', 'WPA2').replace('SAE', 'WPA3'), 'info'),
			btn(t('Conectar'), () => connectTo(n), 'sm primary')]);
		results.replaceChildren(table([t('Red'), t('Banda / canal'), t('Señal'), t('Seguridad'), ''], rows, t('No se encontraron redes')));
	};

	return [
		card(t('Conexión como repetidor'), h('div', { class: 'form', style: { maxWidth: 'none' } },
			rep ? kv([
				[t('Red'), h('b', rep.ssid)],
				[t('Estado'), !rep.enabled ? badge(t('Desactivado')) : ww && ww.up ? badge(t('Conectado'), 'ok') : badge(t('Conectando / sin conexión'), 'warn')],
				[t('IP obtenida'), ww && ww.ipaddr || '—'], [t('Puerta de enlace'), ww && ww.gateway || '—']])
				: h('div', { class: 'muted' }, t('El router no está conectado a ninguna red WiFi como cliente.')),
			note(t('El repetidor usa una red WiFi existente como salida a internet (WAN inalámbrica). Con la WAN por cable activa, queda como respaldo con menor prioridad; para conmutación automática activá Multi-WAN.')),
			rep ? h('div', { class: 'form-actions' },
				rep.enabled ? btn(t('Desconectar'), async () => { await api('repeater_set', { enabled: false }); toast('Repetidor desactivado', 'ok'); setTimeout(navigate, 3000); }, 'danger')
					: btn(t('Reconectar'), async () => { await api('repeater_set', { enabled: true, ssid: rep.ssid, key: '', encryption: rep.encryption }); }, '')) : null),
		),
		card(t('Redes disponibles'), results, btn(t('Buscar redes'), scan, 'primary', 'refresh')),
	];
});

/* ================================================================== Multi-WAN */

page('/multiwan', t('Internet · Multi-WAN'), async () => {
	const m = await api('multiwan_get');
	const en = toggle(m.enabled);
	const mode = select([['failover', t('Conmutación por falla (failover)')], ['balance', t('Balanceo de carga')]], m.mode);
	const track = input(m.track);
	return [card('Multi-WAN', h('div', { class: 'form' },
		field(t('Activar'), en),
		field(t('Modo'), mode, t('Failover: el cable es la principal y el repetidor el respaldo')),
		field(t('IPs de verificación'), track, t('Se hace ping a estas IPs para detectar si cada salida tiene internet')),
		!m.has_wwan ? note(t('Todavía no hay una segunda salida: configurá el Repetidor para tener WAN por WiFi.'), 'warn') : null,
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			await api('multiwan_set', { enabled: en.checked, mode: mode.value, track: track.value });
			toast('Multi-WAN guardado', 'ok');
		}, 'primary')))),
	card(t('Estado'), h('pre', { class: 'log' }, m.status || 'mwan3 detenido'))];
});

/* ================================================================== Wireless */

const SECURITY = [['sae-mixed', t('WPA2/WPA3 mixto (recomendado)')], ['sae', 'WPA3'], ['psk2', 'WPA2'], ['psk-mixed', 'WPA/WPA2'], ['none', t('Abierta (sin contraseña)')]];
const COUNTRIES = [['AR', t('Argentina')], ['BR', t('Brasil')], ['CL', t('Chile')], ['UY', t('Uruguay')], ['PY', t('Paraguay')], ['BO', t('Bolivia')], ['PE', t('Perú')], ['CO', t('Colombia')], ['MX', t('México')], ['ES', t('España')], ['US', t('Estados Unidos')], ['DE', t('Alemania')], ['GB', t('Reino Unido')]];

page('/wireless', t('Inalámbrico'), async () => {
	const w = await api('wifi_get');
	if (!w.present) return card('WiFi', note(t('No se detectó ninguna placa WiFi. En la VM, revisá que la placa esté asignada con PCI passthrough.')));
	const en = toggle(w.enabled);
	const ssid = input(w.ssid, { maxLength: 32 });
	const key = password(w.key);
	const sec = select(SECURITY, w.security);
	const hidden = toggle(w.hidden);
	const band = select([['5g', '5 GHz'], ['2g', '2,4 GHz']], w.band);
	const chan = select([], '');
	const width = select([], '');
	const txp = select([['', t('Máxima (automática)')], ...[23, 20, 17, 14, 11, 8].map(x => [String(x), x + ' dBm'])], w.txpower);
	const iso = toggle(w.isolate);
	const country = select(COUNTRIES, w.country);
	const fill = () => {
		const list = (w.channels && w.channels[band.value]) || [];
		chan.replaceChildren(...[['auto', t('Automático')], ...list.map(c => [c, String(c)])].map(([v, l]) => h('option', { value: v, selected: String(v) === String(w.channel) }, l)));
		const widths = band.value === '2g' ? [['HE20', '20 MHz'], ['HE40', '40 MHz']] : [['HE20', '20 MHz'], ['HE40', '40 MHz'], ['HE80', '80 MHz'], ['HE160', '160 MHz']];
		width.replaceChildren(...widths.map(([v, l]) => h('option', { value: v, selected: v === w.htmode }, l)));
		if (!widths.find(x => x[0] === width.value)) width.value = band.value === '2g' ? 'HE20' : 'HE80';
	};
	band.addEventListener('change', fill);
	fill();
	const keyRow = field(t('Contraseña'), key);
	const syncSec = () => { keyRow.style.display = sec.value === 'none' ? 'none' : ''; };
	sec.addEventListener('change', syncSec); syncSec();

	const saveMain = async () => {
		if (sec.value !== 'none' && key.value.length < 8) throw new Error(t('La contraseña debe tener al menos 8 caracteres'));
		await api('wifi_set', { enabled: en.checked, ssid: ssid.value, key: sec.value === 'none' ? undefined : key.value, security: sec.value, hidden: hidden.checked });
		toast('WiFi actualizada. Los clientes se reconectan en unos segundos.', 'ok');
	};
	const saveAdv = async () => {
		await api('wifi_set', { band: band.value, channel: chan.value, htmode: width.value, txpower: txp.value, isolate: iso.checked, country: country.value });
		toast('Ajustes de radio aplicados', 'ok');
	};
	const live = w.live || {};
	return [
		card(t('Red WiFi principal'), h('div', { class: 'form' },
			field('WiFi', en),
			field(t('Nombre (SSID)'), ssid),
			field(t('Seguridad'), sec, w.guest_enabled && sec.value.startsWith('sae') ? t('Con la red de invitados activa se usa WPA2 (ver Red de invitados)') : null),
			keyRow,
			field(t('Ocultar SSID'), hidden),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), saveMain, 'primary'))),
			h('div', { class: 'small muted' }, live.channel ? t('Ahora: canal {0} ({1} GHz) · {2} · {3}', live.channel, live.frequency, live.htmode || '', live.hwmodes || '') : '')),
		card(t('Radio'), h('div', { class: 'form' },
			field(t('Banda'), band), field(t('Canal'), chan), field(t('Ancho de canal'), width), field(t('Potencia de transmisión'), txp),
			field(t('Aislamiento de clientes'), iso, t('Los dispositivos WiFi no se ven entre sí')),
			field(t('País'), country, t('Define canales y potencia legales')),
			note(t('Esta placa ({0}) tiene una sola radio: trabaja en una banda por vez y admite una sola red emitida. La red de invitados usa el mismo SSID con otra contraseña.', live.hwmodes || 'WiFi')),
			h('div', { class: 'form-actions' }, btn(t('Aplicar'), saveAdv, 'primary')))),
		card(t('Red de invitados'), h('div', { class: 'inline' }, w.guest_enabled ? badge(t('Activa'), 'ok') : badge(t('Inactiva')), h('a', { href: '#/guest' }, t('Configurar red de invitados')))),
	];
});

page('/guest', t('Red · Invitados'), async () => {
	const [w, g, d] = await Promise.all([api('wifi_get'), uci.get('network', 'guest'), uci.get('dhcp', 'guest')]);
	const en = toggle(w.guest_enabled);
	const gk = password(w.guest_key);
	const ip = input(g.ipaddr), start = input(d.start, { type: 'number' }), limit = input(d.limit, { type: 'number' });
	return [
		card(t('WiFi de invitados'), !w.present ? note(t('No hay placa WiFi.')) : h('div', { class: 'form' },
			field(t('Activar'), en),
			field(t('Contraseña de invitados'), gk, t('Distinta de la principal')),
			note([t('Los invitados se conectan a la misma red «'), h('b', w.ssid), t('» pero con esta contraseña: quedan en una red aislada con salida a internet, sin acceso a tu LAN ni a la administración del router.')]),
			w.security.startsWith('sae') ? note(t('Con invitados activo la red pasa a WPA2: el protocolo WPA3 (SAE) no permite elegir la red según la contraseña.'), 'warn') : null,
			h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
				await api('wifi_set', { guest_enabled: en.checked, guest_key: gk.value });
				toast('Red de invitados actualizada', 'ok');
			}, 'primary')))),
		card(t('Red de invitados (IP)'), h('div', { class: 'form' },
			field(t('IP del router'), ip), field(t('Inicio DHCP'), start), field(t('Cantidad de direcciones'), limit),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
				await uci.save('network', 'guest', { ipaddr: ip.value }, null);
				await uci.save('dhcp', 'guest', { start: start.value, limit: limit.value }, 'network');
				toast('Guardado', 'ok');
			}, 'primary')))),
	];
});

/* ================================================================== Clients */

page('/clients', t('Clientes'), async () => {
	let filterMode = 'all';
	let data = [];
	const body = h('div');
	const tabs = h('div', { class: 'tabs' });
	const setTab = (m) => { filterMode = m; render(); };
	const mkTabs = () => tabs.replaceChildren(...[['all', t('Todos')], ['online', t('Conectados')], ['blocked', t('Bloqueados')]].map(([k, l]) =>
		h('button', { class: filterMode === k ? 'active' : '', onclick: () => setTab(k) }, l + ' (' + count(k) + ')')));
	const count = (k) => data.filter(c => k === 'all' || (k === 'online' ? c.online : c.blocked)).length;

	const edit = async (c) => {
		const name = input(c.name || '', { placeholder: c.hostname || t('Nombre') });
		const resv = toggle(!!c.reserved_ip);
		const rip = input(c.reserved_ip || c.ip || '');
		const r = await modal(t('Editar dispositivo'), h('div', { class: 'form' },
			kv([['MAC', h('span', { class: 'mono' }, c.mac)], [t('Nombre de host'), c.hostname || '—'], [t('IP actual'), c.ip || '—']]),
			field(t('Nombre'), name), field(t('Reservar IP'), resv), field(t('IP reservada'), rip, t('Siempre recibirá esta IP por DHCP'))),
		[[t('Cancelar'), null], [t('Guardar'), async () => {
			await api('client_set', { mac: c.mac, name: name.value, reserved_ip: resv.checked ? rip.value : '' });
			return true;
		}, 'primary']]);
		if (r) { toast('Guardado', 'ok'); load(); }
	};

	const render = () => {
		mkTabs();
		const list = data.filter(c => filterMode === 'all' || (filterMode === 'online' ? c.online : c.blocked))
			.sort((a, b) => (b.online - a.online) || String(a.name || a.hostname || a.mac).localeCompare(String(b.name || b.hostname || b.mac)));
		body.replaceChildren(table([t('Dispositivo'), 'IP', t('Conexión'), t('Tráfico'), t('Internet'), ''], list.map(c => [
			h('div', h('div', { class: 'inline' }, h('span', { class: 'dot ' + (c.online ? 'ok' : '') }), h('span', { class: 'client-name' }, c.name || c.hostname || t('Desconocido'))),
				h('div', { class: 'mono muted' }, c.mac)),
			h('div', c.ip || '—', c.reserved_ip ? h('div', { class: 'small muted' }, t('reservada')) : null),
			h('div', { class: 'inline' }, c.wireless ? icon('wifi') : icon('cable'),
				c.network === 'guest' ? badge(t('Invitados'), 'warn') : badge('LAN', 'info'),
				c.wireless && c.signal ? h('span', { class: 'small muted' }, c.signal + ' dBm') : null),
			h('div', { class: 'small' }, '↓ ' + fmtBytes(c.traffic_rx), h('br'), '↑ ' + fmtBytes(c.traffic_tx)),
			toggle(!c.blocked, async (on) => { await api('client_set', { mac: c.mac, blocked: !on }); c.blocked = !on; toast(on ? t('Acceso permitido') : t('Dispositivo bloqueado'), 'ok'); mkTabs(); }),
			iconBtn('edit', t('Editar'), () => edit(c))]), t('No hay dispositivos')));
	};

	const load = async () => { data = (await api('clients')).clients; render(); };
	await load();
	MOR.timers.push(setInterval(() => { if (!document.querySelector('.overlay')) load().catch(() => {}); }, 10000));
	return card(t('Dispositivos'), h('div', tabs, body), btn(t('Actualizar'), load, 'sm', 'refresh'));
});
