/* MyOwnRouter web UI — VPN, applications, network, system. SPDX-License-Identifier: GPL-2.0-only */
'use strict';

/* ================================================================== VPN */

page('/vpn', t('VPN · Panel'), async () => {
	const [v, ws, ts, zt, st] = await Promise.all([api('vpn_list'), api('wgserver_get'), api('tailscale_status'), api('zerotier_status'), api('status')]);
	const active = v.clients.find(c => c.up || c.enabled);
	const quick = select([['', t('— elegir perfil —')], ...v.clients.map(c => [c.id, c.name + ' (' + (c.type === 'wireguard' ? 'WireGuard' : 'OpenVPN') + ')'])], active ? active.id : '');
	return h('div', { class: 'grid c2' },
		card(t('Cliente VPN'), h('div', { class: 'form' },
			active ? kv([[t('Perfil'), h('b', active.name)], [t('Tipo'), active.type === 'wireguard' ? 'WireGuard' : 'OpenVPN'],
				[t('Estado'), active.up ? badge(t('Conectado'), 'ok') : badge(t('Conectando…'), 'warn')]]) : h('div', { class: 'muted' }, t('Ninguna VPN cliente activa. Todo el tráfico sale directo por la WAN.')),
			v.clients.length ? h('div', { class: 'inline' }, quick,
				btn(t('Conectar'), async () => { if (!quick.value) return; await api('vpn_connect', { id: quick.value, connect: true }); toast('Conectando…', 'ok'); setTimeout(navigate, 4000); }, 'primary'),
				active ? btn(t('Desconectar'), async () => { await api('vpn_connect', { id: active.id, connect: false }); toast('Desconectado', 'ok'); setTimeout(navigate, 3000); }, 'danger') : null)
				: h('a', { href: '#/vpn-client' }, t('Agregar un perfil WireGuard u OpenVPN')))),
		card(t('Servidor WireGuard'), kv([[t('Estado'), ws.enabled ? badge(t('Activo'), 'ok') : badge(t('Apagado'))], [t('Puerto'), ws.port + '/udp'], [t('Clientes'), String(ws.peers.length)]]), h('a', { href: '#/wg-server' }, t('Configurar'))),
		card('Tailscale', kv([[t('Estado'), !ts.running ? badge(t('Apagado')) : ts.backend_state === 'Running' ? badge(t('Conectado'), 'ok') : badge(ts.backend_state || '—', 'warn')],
			['IP', ts.self && ts.self.ips ? ts.self.ips.join(', ') : '—']]), h('a', { href: '#/tailscale' }, t('Configurar'))),
		card('ZeroTier / Tor', kv([['ZeroTier', zt.running ? badge(t('Activo'), 'ok') : badge(t('Apagado'))], ['Tor', st.apps.tor ? badge(t('Activo'), 'ok') : badge(t('Apagado'))]]),
			h('span', h('a', { href: '#/zerotier' }, 'ZeroTier'), t(' · '), h('a', { href: '#/tor' }, 'Tor'))));
});

page('/vpn-client', t('VPN · Clientes'), async () => {
	const v = await api('vpn_list');
	const pol = v.policy || {};
	const add = async () => {
		const type = select([['wireguard', 'WireGuard (.conf)'], ['openvpn', 'OpenVPN (.ovpn)']], 'wireguard');
		const name = input('', { placeholder: t('ej: casa, proton_ar'), maxLength: 15 });
		const conf = h('textarea', { placeholder: t('Pegá la configuración o cargá el archivo') });
		const user = input(''), pass = password('');
		const auth = h('div', { class: 'form' }, field(t('Usuario'), user), field(t('Contraseña'), pass));
		const sync = () => { auth.style.display = type.value === 'openvpn' ? '' : 'none'; };
		type.addEventListener('change', sync); sync();
		const fb = fileButton(t('Cargar archivo…'), '.conf,.ovpn,.txt', async (f) => {
			conf.value = await readFile(f);
			if (/\.ovpn$/i.test(f.name)) { type.value = 'openvpn'; sync(); }
			if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 15);
		});
		const r = await modal(t('Agregar perfil VPN'), h('div', { class: 'form' }, field(t('Tipo'), type), field(t('Nombre'), name), h('div', fb), conf, auth),
			[[t('Cancelar'), null], [t('Agregar'), async () => {
				await api('vpn_import', { type: type.value, name: name.value, config: conf.value, username: user.value, password: pass.value });
				return true;
			}, 'primary']], { wide: true });
		if (r) { toast('Perfil agregado', 'ok'); navigate(); }
	};
	const ks = toggle(pol.kill_switch === '1');
	return [
		card(t('Perfiles'), table([t('Nombre'), t('Tipo'), t('Servidor'), t('Estado'), ''], v.clients.map(c => [
			h('b', c.name), c.type === 'wireguard' ? 'WireGuard' : 'OpenVPN', c.endpoint || '—',
			c.up ? badge(t('Conectado'), 'ok') : c.enabled ? badge(t('Conectando'), 'warn') : badge(t('Desconectado')),
			h('span', { class: 'inline', style: { justifyContent: 'flex-end' } },
				c.enabled ? btn(t('Desconectar'), async () => { await api('vpn_connect', { id: c.id, connect: false }); setTimeout(navigate, 2500); }, 'sm')
					: btn(t('Conectar'), async () => { await api('vpn_connect', { id: c.id, connect: true }); toast('Conectando…', 'ok'); setTimeout(navigate, 4000); }, 'sm primary'),
				iconBtn('trash', t('Eliminar'), async () => {
					if (await confirmDlg(t('Eliminar perfil'), t('¿Eliminar «{0}»?', c.name), t('Eliminar'), true)) { await api('vpn_delete', { id: c.id }); navigate(); }
				}, 'danger'))]), t('Todavía no agregaste perfiles')), btn(t('Agregar perfil'), add, 'primary sm', 'plus')),
		card(t('Política'), h('div', { class: 'form' },
			note(t('Con un cliente VPN conectado, todo el tráfico de la LAN sale por el túnel (solo uno activo a la vez). La red de invitados sale siempre directo. Para reglas por dispositivo o por dominio usá «Policy Based Routing» en la configuración avanzada.')),
			field(t('Bloquear internet si la VPN cae (kill switch)'), ks),
			h('div', { class: 'form-actions' },
				h('a', { class: 'btn', href: '/cgi-bin/luci/admin/services/pbr', target: '_blank' }, t('Reglas avanzadas (PBR)')),
				btn(t('Guardar'), async () => { await api('vpn_policy_set', { mode: 'all', macs: [], kill_switch: ks.checked }); toast('Guardado', 'ok'); }, 'primary')))),
	];
});

page('/wg-server', t('VPN · Servidor WireGuard'), async () => {
	const s = await api('wgserver_get');
	const en = toggle(s.enabled);
	const port = input(s.port, { type: 'number' });
	const addr = input(s.address);
	const ep = input(s.endpoint, { placeholder: t('mi-casa.duckdns.org o IP pública') });
	const full = toggle(s.full_tunnel);
	const show = async (p) => {
		const r = await api('wgserver_peer_conf', { name: p.name });
		const dl = () => { const a = h('a', { href: URL.createObjectURL(new Blob([r.config], { type: 'text/plain' })), download: p.name + '.conf' }); a.click(); };
		await modal(t('Cliente «{0}»', p.name), h('div', { class: 'grid c2' },
			h('div', { class: 'qr', html: r.qr_svg }),
			h('pre', { class: 'log', style: { fontSize: '11px' } }, r.config)), [[t('Descargar .conf'), () => { dl(); return false; }], [t('Cerrar'), null]], { wide: true });
	};
	const addPeer = async () => {
		const n = input('', { placeholder: t('ej: celular'), maxLength: 15 });
		const r = await modal(t('Nuevo cliente'), field(t('Nombre'), n), [[t('Cancelar'), null], [t('Crear'), async () => { await api('wgserver_peer_add', { name: n.value }); return true; }, 'primary']]);
		if (r) { toast('Cliente creado', 'ok'); await navigate(); }
	};
	const ago = (ts) => !ts ? t('nunca') : t('hace {0}', fmtUptime(Date.now() / 1000 - ts));
	return [
		card(t('Servidor'), h('div', { class: 'form' },
			field(t('Activar'), en), field(t('Puerto UDP'), port), field(t('Subred del túnel'), addr),
			field(t('Dirección pública'), ep, t('DNS dinámico o IP pública con la que te conectás desde afuera')),
			field(t('Todo el tráfico por el túnel'), full, t('Si se apaga, los clientes solo acceden a la LAN')),
			s.public_key ? field(t('Clave pública'), h('span', { class: 'mono' }, s.public_key)) : null,
			note(t('Este router está detrás de otro (WAN {0}). Para conectarte desde internet, reenviá el puerto {1}/UDP del router principal hacia esa IP.', s.wan_ip || '?', s.port), 'warn'),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
				await api('wgserver_set', { enabled: en.checked, port: port.value, address: addr.value, endpoint: ep.value, full_tunnel: full.checked });
				toast('Servidor guardado', 'ok'); setTimeout(navigate, 1500);
			}, 'primary')))),
		card(t('Clientes'), table([t('Nombre'), 'IP', t('Último contacto'), t('Tráfico'), ''], s.peers.map(p => [
			h('b', p.name), p.ip, ago(p.handshake), p.rx != null ? '↓ ' + fmtBytes(p.tx) + t(' · ↑ ') + fmtBytes(p.rx) : '—',
			h('span', { class: 'inline', style: { justifyContent: 'flex-end' } }, btn('Ver / QR', () => show(p), 'sm'),
				iconBtn('trash', t('Eliminar'), async () => { if (await confirmDlg(t('Eliminar cliente'), t('¿Eliminar «{0}»?', p.name), t('Eliminar'), true)) { await api('wgserver_peer_del', { name: p.name }); navigate(); } }, 'danger'))]),
			t('Sin clientes')), s.configured ? btn(t('Agregar cliente'), addPeer, 'primary sm', 'plus') : null),
	];
});

page('/tor', t('VPN · Tor'), async () => {
	const st = await api('status');
	const en = toggle(st.apps.tor, async (on) => { await api('tor_set', { enabled: on }); toast(on ? t('Tor activado (puede tardar un minuto en conectar)') : t('Tor desactivado'), 'ok'); });
	return card('Tor', h('div', { class: 'form' }, field(t('Enviar el tráfico de la LAN por Tor'), en),
		note(t('Todo el tráfico TCP y las consultas DNS de la LAN pasan por la red Tor (anónimo pero lento; UDP no funciona). Permite abrir direcciones .onion. Los invitados no se ven afectados.'), 'warn')));
});

/* ================================================================== Applications */

page('/plugins', t('Aplicaciones · Complementos'), async () => {
	const r = await api('packages');
	const q = input('', { placeholder: t('Buscar paquete…') });
	const body = h('div');
	const render = () => body.replaceChildren(table([t('Paquete'), t('Versión')], r.installed.filter(p => !q.value || p.name.includes(q.value)).map(p => [h('span', { class: 'mono' }, p.name), p.version])));
	q.addEventListener('input', render); render();
	return card(t('{0} paquetes instalados', r.installed.length), h('div', h('div', { style: { marginBottom: '12px' } }, q), body),
		h('a', { class: 'btn primary sm', href: '/cgi-bin/luci/admin/system/package-manager', target: '_blank' }, t('Instalar más paquetes')));
});

page('/adguard', t('Aplicaciones · AdGuard Home'), async () => {
	const [cfg, svc, lan] = await Promise.all([uci.tryGet('myownrouter', 'adguard'), api('service_status'), uci.get('network', 'lan')]);
	const on = cfg && cfg.enabled === '1';
	const url = 'http://' + lan.ipaddr + ':3000/';
	return card('AdGuard Home', h('div', { class: 'form' },
		field(t('Bloqueo de publicidad y rastreadores'), toggle(on, async (v) => { await api('adguard_set', { enabled: v }); toast(v ? t('AdGuard Home activado') : t('AdGuard Home desactivado'), 'ok'); setTimeout(navigate, 2500); })),
		field(t('Estado'), svc.services.adguardhome ? badge(t('En ejecución'), 'ok') : badge(t('Detenido'))),
		on ? field(t('Panel de AdGuard'), h('a', { href: url, target: '_blank' }, url)) : null,
		note(t('El DNS del router (dnsmasq) reenvía las consultas a AdGuard Home, que filtra y resuelve por DNS cifrado (Quad9 / Cloudflare). El panel de AdGuard solo es accesible desde la LAN y no tiene contraseña propia.'))));
});

const DDNS_PROVIDERS = ['duckdns.org', 'dynu.com', 'dynv6.com', 'afraid.org-v2-token', 'desec.io', 'ydns.io', 'ipv64.net', 'now-dns.com', 'he.net', 'dyndns.org', 'no-ip.pl', 'namecheap.com', 'ovh.com', 'strato.com'];

page('/ddns', t('Aplicaciones · DNS dinámico'), async () => {
	const d = (await uci.tryGet('ddns', 'mor')) || {};
	const en = toggle(d.enabled === '1');
	const svc = select(DDNS_PROVIDERS, d.service_name || 'duckdns.org');
	const dom = input(d.domain, { placeholder: 'micasa.duckdns.org' });
	const user = input(d.username, { placeholder: t('usuario (en DuckDNS: el dominio sin .duckdns.org)') });
	const pass = password(d.password, { placeholder: t('contraseña / token') });
	return card(t('DNS dinámico'), h('div', { class: 'form' },
		field(t('Activar'), en), field(t('Proveedor'), svc), field(t('Dominio'), dom), field(t('Usuario'), user), field(t('Contraseña / token'), pass),
		note(t('La IP pública se detecta consultando un servicio web, así funciona aunque este router esté detrás de otro (doble NAT).')),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			await uci.ensure('ddns', 'service', 'mor');
			await uci.save('ddns', 'mor', { enabled: en.checked ? '1' : '0', service_name: svc.value, domain: dom.value, lookup_host: dom.value,
				username: user.value, password: pass.value, interface: 'wan', ip_source: 'web', ip_url: 'https://api.ipify.org',
				use_https: '1', cacert: '/etc/ssl/certs', check_interval: '10', check_unit: 'minutes', use_ipv6: '0' });
			await api('service', { name: 'ddns', action: en.checked ? 'on' : 'off' });
			toast('DNS dinámico guardado', 'ok');
		}, 'primary'))));
});

page('/nas', t('Aplicaciones · Almacenamiento en red'), async () => {
	const [s, svc] = await Promise.all([uci.tryGet('ksmbd', 'mor'), api('service_status')]);
	const sh = s || {};
	const en = toggle(!!s && svc.services.ksmbd);
	const name = input(sh.name || 'compartido'), path = input(sh.path || '/mnt/compartido');
	const ro = toggle(sh.read_only === 'yes');
	return card(t('Carpeta compartida (SMB)'), h('div', { class: 'form' },
		field(t('Activar'), en), field(t('Nombre del recurso'), name), field(t('Carpeta en el router'), path, t('Se crea si no existe. Para más espacio agregá un disco virtual a la VM y montalo ahí.')),
		field(t('Solo lectura'), ro),
		note(t('Acceso de invitado (sin usuario) desde la LAN: {0}', '\\\\' + (MOR.state.status ? MOR.state.status.lan.ipaddr : 'router') + '\\' + name.value)),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			await uci.ensure('ksmbd', 'share', 'mor');
			await uci.save('ksmbd', 'mor', { name: name.value, path: path.value, read_only: ro.checked ? 'yes' : 'no', guest_ok: 'yes', create_mask: '0666', dir_mask: '0777', force_root: '1' });
			await api('apply', { what: 'samba_prepare' }).catch(() => {});
			await api('service', { name: 'ksmbd', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/parental', t('Aplicaciones · Control parental'), async () => {
	const [rules, cl] = await Promise.all([uci.sections('firewall', 'rule'), api('clients')]);
	const mine = rules.filter(r => /^mor_pc_/.test(r['.name']));
	const cname = (mac) => { const c = cl.clients.find(x => x.mac === (mac || '').toLowerCase()); return c ? (c.name || c.hostname || mac) : mac; };
	const dayNames = { Mon: t('Lu'), Tue: t('Ma'), Wed: t('Mi'), Thu: t('Ju'), Fri: t('Vi'), Sat: t('Sá'), Sun: t('Do') };
	const add = async () => {
		const dev = select(cl.clients.map(c => [c.mac, (c.name || c.hostname || t('Desconocido')) + t(' · ') + c.mac]), '');
		const days = daysPicker('');
		const from = input('22:00', { type: 'time' }), to = input('07:00', { type: 'time' });
		const r = await modal(t('Bloqueo por horario'), h('div', { class: 'form' }, field(t('Dispositivo'), dev), field(t('Días'), days), field(t('Bloquear desde'), from), field(t('Hasta'), to),
			note(t('Si el horario cruza la medianoche se crean dos reglas.'))),
		[[t('Cancelar'), null], [t('Crear'), async () => {
			if (!dev.value) throw new Error(t('Elegí un dispositivo'));
			const base = { src: 'lan', dest: 'wan', proto: 'all', src_mac: [dev.value], target: 'REJECT', enabled: '1', weekdays: days.value.join(' ') };
			const id = 'mor_pc_' + dev.value.replace(/:/g, '') + '_' + Date.now().toString(36);
			if (from.value < to.value) {
				await uci.add('firewall', 'rule', id, Object.assign({ name: 'Parental ' + cname(dev.value), start_time: from.value + ':00', stop_time: to.value + ':00' }, base));
			} else {
				await uci.add('firewall', 'rule', id + 'a', Object.assign({ name: 'Parental ' + cname(dev.value), start_time: from.value + ':00', stop_time: '23:59:59' }, base));
				await uci.add('firewall', 'rule', id + 'b', Object.assign({ name: 'Parental ' + cname(dev.value), start_time: '00:00:00', stop_time: to.value + ':00' }, base));
			}
			await uci.commit('firewall');
			await api('apply', { what: 'firewall' });
			return true;
		}, 'primary']]);
		if (r) { toast('Regla creada', 'ok'); navigate(); }
	};
	return card(t('Bloqueos por horario'), h('div',
		table([t('Dispositivo'), t('Días'), t('Horario'), t('Activa'), ''], mine.map(r => [
			h('b', cname([].concat(r.src_mac || [])[0])), (r.weekdays || t('todos')).split(' ').map(d => dayNames[d] || d).join(' '),
			(r.start_time || '').slice(0, 5) + ' – ' + (r.stop_time || '').slice(0, 5),
			toggle(r.enabled !== '0', async (on) => { await uci.save('firewall', r['.name'], { enabled: on ? '1' : '0' }, 'firewall'); }),
			iconBtn('trash', t('Eliminar'), async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]),
		t('Sin reglas')),
		h('div', { class: 'small muted', style: { marginTop: '10px' } }, t('Para cortar internet a un dispositivo en el momento usá el interruptor «Internet» en Clientes.'))),
	btn(t('Agregar regla'), add, 'primary sm', 'plus'));
});

page('/zerotier', t('Aplicaciones · ZeroTier'), async () => {
	const [z, cfg] = await Promise.all([api('zerotier_status'), uci.get('zerotier')]);
	const net = Object.values(cfg).find(s => s['.type'] === 'network');
	const en = toggle(cfg.global && cfg.global.enabled === '1');
	const nid = input(net ? net.id : '', { placeholder: t('ID de red (16 caracteres)'), maxLength: 16 });
	return [card('ZeroTier', h('div', { class: 'form' }, field(t('Activar'), en), field(t('ID de red'), nid),
		note(t('Después de unirte, autorizá este equipo en el panel de ZeroTier (my.zerotier.com). La interfaz ZeroTier queda en la zona LAN.')),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			await api('zerotier_set', { enabled: en.checked, network_id: nid.value });
			toast('Guardado', 'ok'); setTimeout(navigate, 5000);
		}, 'primary')))),
	card(t('Estado'), z.running ? h('div', kv([[t('Dirección del nodo'), z.address], [t('En línea'), z.online ? t('Sí') : t('No')]]),
		table([t('Red'), t('Nombre'), t('Estado'), 'IPs'], z.networks.map(n => [h('span', { class: 'mono' }, n.id), n.name || '—', n.status, (n.ips || []).join(', ')]), t('Sin redes')))
		: h('div', { class: 'muted' }, t('Detenido')))];
});

page('/tailscale', t('Aplicaciones · Tailscale'), async () => {
	const ts = await api('tailscale_status');
	const lanRoute = toggle(ts.advertise_lan), exit = toggle(ts.exit_node);
	const en = toggle(ts.running);
	const stateBox = h('div');
	const paint = (ts) => stateBox.replaceChildren(kv([
		[t('Servicio'), ts.running ? badge(t('En ejecución'), 'ok') : badge(t('Detenido'))],
		[t('Estado'), ts.backend_state === 'Running' ? badge(t('Conectado'), 'ok') : (ts.backend_state || '—')],
		[t('Equipo'), ts.self ? ts.self.hostname : '—'], [t('IPs Tailscale'), ts.self && ts.self.ips ? ts.self.ips.join(', ') : '—'], [t('Otros equipos'), String(ts.peers)],
		[t('Inicio de sesión'), ts.auth_url ? h('a', { href: ts.auth_url, target: '_blank' }, t('Autorizar este router en Tailscale ↗')) : (ts.backend_state === 'NeedsLogin' ? t('esperando enlace…') : '—')]]));
	paint(ts);
	MOR.timers.push(setInterval(async () => { try { paint(await api('tailscale_status')); } catch (e) { /* */ } }, 4000));
	return [card('Tailscale', h('div', { class: 'form' },
		field(t('Activar'), en), field(t('Compartir la LAN (subnet router)'), lanRoute), field(t('Ofrecer como nodo de salida'), exit),
		note(t('Las rutas y el nodo de salida hay que aprobarlos en el panel de Tailscale.')),
		h('div', { class: 'form-actions' },
			ts.running ? btn(t('Cerrar sesión'), async () => { await api('tailscale_set', { enabled: false, logout: true }); toast('Sesión cerrada', 'ok'); setTimeout(navigate, 3000); }, 'danger') : null,
			btn(t('Aplicar'), async () => {
				await api('tailscale_set', { enabled: en.checked, advertise_lan: lanRoute.checked, exit_node: exit.checked });
				toast(en.checked ? t('Iniciando Tailscale… el enlace de autorización aparece en unos segundos') : t('Tailscale detenido'), 'ok');
			}, 'primary')))),
	card(t('Estado'), stateBox)];
});

/* ================================================================== Network */

page('/lan', t('Red · LAN y DHCP'), async () => {
	const [lan, dh, hosts] = await Promise.all([uci.get('network', 'lan'), uci.get('dhcp', 'lan'), uci.sections('dhcp', 'host')]);
	const ip = input(lan.ipaddr), mask = select(['255.255.255.0', '255.255.0.0', '255.255.255.128'], lan.netmask || '255.255.255.0');
	const dhcpOn = toggle(dh.ignore !== '1');
	const start = input(dh.start, { type: 'number' }), limit = input(dh.limit, { type: 'number' });
	const lease = select([['1h', '1 hora'], ['6h', '6 horas'], ['12h', '12 horas'], ['24h', t('1 día')], ['7d', t('7 días')]], dh.leasetime || '12h');
	const saveLan = async () => {
		const old = lan.ipaddr;
		await uci.save('dhcp', 'lan', { ignore: dhcpOn.checked ? '' : '1', start: start.value, limit: limit.value, leasetime: lease.value });
		if (ip.value !== old || mask.value !== lan.netmask) {
			if (!(await confirmDlg(t('Cambiar IP de la LAN'), t('Los dispositivos de la LAN van a tener que renovar su IP (desconectar y reconectar).'), t('Aplicar')))) return;
			await uci.save('network', 'lan', { ipaddr: ip.value, netmask: mask.value }, 'network');
			await api('apply', { what: 'dhcp' });
			if (location.hostname === old) return waitForRouter('http://' + ip.value, t('Cambiando la IP del router a {0}…', ip.value));
		} else await api('apply', { what: 'dhcp' });
		toast('Guardado', 'ok');
	};
	const addHost = async () => {
		const cl = (await api('clients')).clients;
		const dev = select([['', t('Ingresar MAC manualmente')], ...cl.map(c => [c.mac, (c.name || c.hostname || '?') + t(' · ') + c.mac])], '');
		const mac = input('', { placeholder: 'aa:bb:cc:dd:ee:ff' }), rip = input(subnetOf(lan.ipaddr), {}), nm = input('');
		dev.addEventListener('change', () => { if (dev.value) { mac.value = dev.value; const c = cl.find(x => x.mac === dev.value); nm.value = c.name || c.hostname || ''; if (c.ip) rip.value = c.ip; } });
		const r = await modal(t('Reservar IP'), h('div', { class: 'form' }, field(t('Dispositivo'), dev), field('MAC', mac), field('IP', rip), field(t('Nombre'), nm)),
			[[t('Cancelar'), null], [t('Guardar'), async () => { await api('client_set', { mac: mac.value, name: nm.value || undefined, reserved_ip: rip.value }); return true; }, 'primary']]);
		if (r) navigate();
	};
	return [
		card(t('Router en la LAN'), h('div', { class: 'form' }, field(t('Dirección IP'), ip), field(t('Máscara'), mask),
			field(t('Servidor DHCP'), dhcpOn), field(t('Primera dirección'), start, t('Desde {0}', subnetOf(ip.value) + start.value)), field(t('Cantidad de direcciones'), limit), field(t('Duración de la concesión'), lease),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), saveLan, 'primary')))),
		card(t('Direcciones reservadas'), table([t('Nombre'), 'MAC', 'IP', ''], hosts.map(x => [x.name || '—', h('span', { class: 'mono' }, [].concat(x.mac || []).join(' ')), x.ip,
			iconBtn('trash', t('Eliminar'), async () => { await uci.del('dhcp', x['.name']); await uci.commit('dhcp'); await api('apply', { what: 'dhcp' }); navigate(); }, 'danger')]), t('Sin reservas')),
		btn(t('Agregar'), addHost, 'primary sm', 'plus')),
	];
});

page('/portfw', t('Red · Reenvío de puertos'), async () => {
	const [reds, cl, st] = await Promise.all([uci.sections('firewall', 'redirect'), api('clients'), api('status')]);
	const list = reds.filter(r => r.src === 'wan' && !/^mor_tor/.test(r['.name']));
	const add = async () => {
		const name = input('', { placeholder: t('ej: servidor-web') });
		const proto = select([['tcp udp', t('TCP y UDP')], ['tcp', 'TCP'], ['udp', 'UDP']], 'tcp');
		const ext = input('', { placeholder: '8080 o 8000-8010' });
		const dev = select([['', t('Elegir dispositivo…')], ...cl.clients.filter(c => c.ip).map(c => [c.ip, (c.name || c.hostname || '?') + t(' · ') + c.ip])], '');
		const ip = input('', { placeholder: subnetOf(st.lan.ipaddr) + 'x' });
		dev.addEventListener('change', () => { if (dev.value) ip.value = dev.value; });
		const intp = input('', { placeholder: t('igual al externo') });
		const r = await modal(t('Nueva regla'), h('div', { class: 'form' }, field(t('Nombre'), name), field(t('Protocolo'), proto), field(t('Puerto externo'), ext), field(t('Dispositivo'), dev), field(t('IP interna'), ip), field(t('Puerto interno'), intp)),
			[[t('Cancelar'), null], [t('Crear'), async () => {
				if (!/^\d+(-\d+)?$/.test(ext.value) || !ip.value) throw new Error(t('Completá puerto externo e IP interna'));
				await uci.add('firewall', 'redirect', 'mor_pf_' + Date.now().toString(36), { name: name.value || 'Reenvio-' + ext.value, src: 'wan', dest: 'lan', proto: proto.value.split(' '),
					src_dport: ext.value, dest_ip: ip.value, dest_port: intp.value || ext.value, target: 'DNAT', enabled: '1' });
				await uci.commit('firewall'); await api('apply', { what: 'firewall' });
				return true;
			}, 'primary']]);
		if (r) { toast('Regla creada', 'ok'); navigate(); }
	};
	return card(t('Reglas'), h('div',
		table([t('Nombre'), t('Protocolo'), t('Puerto externo'), t('Destino'), t('Activa'), ''], list.map(r => [h('b', r.name || r['.name']), [].concat(r.proto || 'tcp udp').join(' ').toUpperCase(), r.src_dport || '—',
			(r.dest_ip || '') + ':' + (r.dest_port || r.src_dport || ''),
			toggle(r.enabled !== '0', async (on) => { await uci.save('firewall', r['.name'], { enabled: on ? '1' : '0' }, 'firewall'); }),
			iconBtn('trash', t('Eliminar'), async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]), t('Sin reglas')),
		h('div', { style: { marginTop: '12px' } }, note(t('Recordá que este router está detrás de otro: el puerto también hay que reenviarlo en el router principal hacia {0}.', st.internet.wan && st.internet.wan.ipaddr || t('la IP WAN')), 'warn'))),
	btn(t('Agregar regla'), add, 'primary sm', 'plus'));
});

page('/firewall', t('Red · Firewall'), async () => {
	const [all, defs] = await Promise.all([uci.get('firewall'), uci.first('firewall', 'defaults')]);
	const rules = Object.values(all).filter(s => s['.type'] === 'rule');
	const open = rules.filter(r => /^mor_open_/.test(r['.name']));
	const ping = rules.find(r => r.name === 'Allow-Ping');
	const mgmt = all.wan_mgmt;
	const add = async () => {
		const name = input(''), proto = select([['tcp', 'TCP'], ['udp', 'UDP'], ['tcp udp', t('TCP y UDP')]], 'tcp'), port = input('', { placeholder: '22 o 1000-2000' });
		const r = await modal(t('Abrir puerto en el router'), h('div', { class: 'form' }, field(t('Nombre'), name), field(t('Protocolo'), proto), field(t('Puerto'), port)),
			[[t('Cancelar'), null], [t('Abrir'), async () => {
				if (!/^\d+(-\d+)?$/.test(port.value)) throw new Error(t('Puerto inválido'));
				await uci.add('firewall', 'rule', 'mor_open_' + Date.now().toString(36), { name: name.value || 'Abrir-' + port.value, src: 'wan', proto: proto.value.split(' '), dest_port: port.value, target: 'ACCEPT', enabled: '1' });
				await uci.commit('firewall'); await api('apply', { what: 'firewall' }); return true;
			}, 'primary']]);
		if (r) navigate();
	};
	const fsave = async (sec, vals) => { await uci.save('firewall', sec, vals, 'firewall'); toast('Aplicado', 'ok'); };
	return [
		card(t('Acceso desde la WAN'), h('div', { class: 'form' },
			field(t('Administración desde redes privadas de la WAN'), toggle(mgmt && mgmt.enabled !== '0', (on) => fsave('wan_mgmt', { enabled: on ? '1' : '0' })), t('Web (80/443) y SSH desde 10.x, 172.16-31.x y 192.168.x del lado WAN')),
			field(t('Responder ping desde la WAN'), toggle(ping && ping.enabled !== '0', (on) => ping && fsave(ping['.name'], { enabled: on ? '1' : '0' }))),
			field(t('Protección SYN flood'), toggle(defs && defs.synflood_protect === '1', (on) => fsave(defs['.name'], { synflood_protect: on ? '1' : '0' }))),
			note(t('Si desactivás la administración desde la WAN, solo vas a poder entrar al router desde la LAN o la WiFi.'), 'warn'))),
		card(t('Puertos abiertos en el router'), table([t('Nombre'), t('Protocolo'), t('Puerto'), ''], open.map(r => [r.name, [].concat(r.proto).join(' ').toUpperCase(), r.dest_port,
			iconBtn('trash', t('Cerrar'), async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]), t('Ninguno')),
			btn(t('Abrir puerto'), add, 'primary sm', 'plus')),
		card(null, h('div', { class: 'inline' }, t('Zonas, reglas de tráfico y NAT avanzadas:'), h('a', { href: '/cgi-bin/luci/admin/network/firewall', target: '_blank' }, t('Firewall en LuCI ↗')))),
	];
});

const DNS_PRESETS = [['', t('Personalizado')], ['1.1.1.1 1.0.0.1', t('Cloudflare')], ['8.8.8.8 8.8.4.4', t('Google')], ['9.9.9.9 149.112.112.112', 'Quad9'], ['94.140.14.14 94.140.15.15', t('AdGuard DNS')], ['208.67.222.222 208.67.220.220', 'OpenDNS']];

page('/dns', t('Red · DNS'), async () => {
	const [dm, wan, hij, agh] = await Promise.all([uci.first('dhcp', 'dnsmasq'), uci.get('network', 'wan'), uci.tryGet('firewall', 'mor_dns_hijack'), uci.tryGet('myownrouter', 'adguard')]);
	const servers = [].concat(dm.server || []).filter(s => s !== '127.0.0.1#3053');
	const manual = toggle(wan.peerdns === '0' || servers.length > 0);
	const preset = select(DNS_PRESETS, DNS_PRESETS.find(p => p[0] && p[0] === servers.join(' ')) ? servers.join(' ') : '');
	const list = input(servers.join(' '), { placeholder: '1.1.1.1 9.9.9.9' });
	preset.addEventListener('change', () => { if (preset.value) list.value = preset.value; });
	const rebind = toggle(dm.rebind_protection !== '0');
	const force = toggle(!!hij);
	const save = async () => {
		const aghOn = agh && agh.enabled === '1';
		const sv = manual.checked ? list.value.split(/[ ,]+/).filter(Boolean) : [];
		if (aghOn) sv.push('127.0.0.1#3053');
		await uci.save('dhcp', dm['.name'], { server: sv, noresolv: aghOn || (manual.checked && sv.length) ? '1' : '', rebind_protection: rebind.checked ? '1' : '0' });
		await uci.save('network', 'wan', { peerdns: manual.checked ? '0' : '' });
		if (force.checked) {
			await uci.ensure('firewall', 'redirect', 'mor_dns_hijack');
			await uci.save('firewall', 'mor_dns_hijack', { name: 'Forzar-DNS-router', src: 'lan', proto: ['tcp', 'udp'], src_dport: '53', dest_port: '53', target: 'DNAT' });
		} else if (hij) { await uci.del('firewall', 'mor_dns_hijack'); await uci.commit('firewall'); }
		await api('apply', { what: 'dhcp' }); await api('apply', { what: 'firewall' }); await api('apply', { what: 'network' });
		toast('DNS actualizado', 'ok');
	};
	return card(t('Servidores DNS'), h('div', { class: 'form' },
		agh && agh.enabled === '1' ? note(t('AdGuard Home está activo: las consultas pasan por AdGuard; los servidores de abajo se usan solo si lo apagás.'), 'warn') : null,
		field(t('DNS manuales'), manual, t('Si está apagado se usan los que entrega la WAN')),
		field(t('Proveedor'), preset), field(t('Servidores'), list),
		field(t('Protección contra DNS rebinding'), rebind),
		field(t('Forzar el DNS del router'), force, t('Redirige al router las consultas DNS de la LAN dirigidas a otros servidores')),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), save, 'primary'))));
});

page('/upnp', t('Red · UPnP'), async () => {
	const u = await uci.get('upnpd', 'config');
	const en = toggle(u.enabled === '1'), sec = toggle(u.secure_mode !== '0');
	return card('UPnP / NAT-PMP', h('div', { class: 'form' }, field(t('Activar'), en), field(t('Modo seguro'), sec, t('Cada dispositivo solo puede abrir puertos hacia sí mismo')),
		note(t('Permite que consolas y aplicaciones abran puertos automáticamente. Con doble NAT solo abre puertos en este router.')),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			await uci.save('upnpd', 'config', { enabled: en.checked ? '1' : '0', secure_mode: sec.checked ? '1' : '0' });
			await api('service', { name: 'miniupnpd', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/qos', t('Red · QoS (SQM)'), async () => {
	const [s, st] = await Promise.all([uci.tryGet('sqm', 'mor'), api('status')]);
	const q = s || {};
	const en = toggle(q.enabled === '1');
	const down = input(q.download ? Math.round(q.download / 1000) : '', { type: 'number', placeholder: t('Mbps') });
	const up = input(q.upload ? Math.round(q.upload / 1000) : '', { type: 'number', placeholder: t('Mbps') });
	return card(t('Control de cola inteligente'), h('div', { class: 'form' },
		field(t('Activar'), en), field(t('Bajada (Mbps)'), down), field(t('Subida (Mbps)'), up),
		note(t('SQM (cake) reduce la latencia cuando la conexión está saturada (videollamadas y juegos mientras se descarga). Poné ~90 % de tu velocidad real medida (ver Sistema › Diagnóstico › Test de velocidad).')),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			if (en.checked && (!+down.value || !+up.value)) throw new Error(t('Completá las velocidades'));
			await uci.ensure('sqm', 'queue', 'mor');
			await uci.save('sqm', 'mor', { enabled: en.checked ? '1' : '0', interface: (st.internet.wan && st.internet.wan.device) || 'eth0',
				download: String(Math.round(+down.value * 1000)), upload: String(Math.round(+up.value * 1000)), qdisc: 'cake', script: 'piece_of_cake.qos', linklayer: 'none' });
			await api('service', { name: 'sqm', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/ipv6', t('Red · IPv6'), async () => {
	const [w6, lan, dh, st] = await Promise.all([uci.tryGet('network', 'wan6'), uci.get('network', 'lan'), uci.get('dhcp', 'lan'), api('status')]);
	const on = w6 && w6.disabled !== '1' && dh.ra !== 'disabled';
	const en = toggle(on);
	return card('IPv6', h('div', { class: 'form' }, field(t('Activar IPv6'), en),
		kv([[t('Direcciones WAN'), (st.internet.wan && st.internet.wan.ip6 || []).join(', ') || '—'], [t('Direcciones LAN'), (st.lan && st.lan.ip6 || []).join(', ') || '—']]),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			if (w6) await uci.save('network', 'wan6', { disabled: en.checked ? '' : '1' });
			await uci.save('network', 'lan', { ip6assign: en.checked ? '60' : '' });
			await uci.save('dhcp', 'lan', { ra: en.checked ? 'server' : 'disabled', dhcpv6: en.checked ? 'server' : 'disabled' });
			await api('apply', { what: 'ipv6' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/netadv', t('Red · Avanzado'), async () => {
	const [defs, glob, br] = await Promise.all([uci.first('firewall', 'defaults'), uci.tryGet('network', 'globals'), uci.tryGet('network', 'br_lan')]);
	return [card(t('Rendimiento'), h('div', { class: 'form' },
		field(t('Aceleración (flow offloading)'), toggle(defs.flow_offloading === '1', async (on) => { await uci.save('firewall', defs['.name'], { flow_offloading: on ? '1' : '0' }, 'firewall'); toast('Aplicado', 'ok'); }),
			t('Las conexiones establecidas saltean parte del firewall: más rendimiento con menos CPU')),
		field(t('Distribuir paquetes entre CPUs'), toggle(glob && glob.packet_steering === '1', async (on) => { await uci.save('network', 'globals', { packet_steering: on ? '1' : '0' }, 'network'); toast('Aplicado', 'ok'); })),
		field(t('IGMP snooping (multicast/IPTV)'), toggle(br && br.igmp_snooping === '1', async (on) => { await uci.save('network', 'br_lan', { igmp_snooping: on ? '1' : '0' }, 'network'); toast('Aplicado', 'ok'); })))),
	card(null, h('div', { class: 'inline' }, t('Interfaces, VLAN, rutas estáticas y más:'), h('a', { href: '/cgi-bin/luci/admin/network/network', target: '_blank' }, t('Red en LuCI ↗'))))];
});

/* ================================================================== System */

page('/system', t('Sistema · Resumen'), async () => {
	const [s, sys] = await Promise.all([api('status'), uci.first('system', 'system')]);
	const hn = input(sys.hostname);
	return [card(t('Equipo'), kv([
		[t('Modelo'), s.system.model], [t('Firmware'), s.system.release], [t('Kernel'), s.system.kernel], [t('Tiempo encendido'), fmtUptime(s.system.uptime)],
		[t('Hora del router'), new Date(s.system.localtime * 1000).toLocaleString()], ['CPUs', String(s.system.cpus)],
		[t('Carga'), s.system.load.map(x => x.toFixed(2)).join(' / ')],
		[t('Memoria'), t('{0} usados de {1}', fmtBytes(s.system.memory.total - s.system.memory.available), fmtBytes(s.system.memory.total))],
		[t('Almacenamiento'), t('{0} usados de {1}', fmtBytes(s.system.storage.used), fmtBytes(s.system.storage.total))],
		[t('MAC WAN'), s.internet.wan && s.internet.wan.mac], [t('MAC LAN'), s.lan && s.lan.mac]]),
		btn(t('Reiniciar'), async () => {
			if (await confirmDlg(t('Reiniciar'), t('¿Reiniciar el router ahora? Se corta la conexión por un minuto.'), t('Reiniciar'), true)) { await api('reboot'); waitForRouter('', t('Reiniciando…')); }
		}, 'danger sm')),
	card(t('Nombre del router'), h('div', { class: 'form' }, field(t('Nombre'), hn), h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
		await uci.save('system', sys['.name'], { hostname: hn.value }, 'system'); toast('Guardado', 'ok');
	}, 'primary'))))];
});

page('/upgrade', t('Sistema · Actualizar firmware'), async () => {
	const s = await api('status');
	const info = h('div');
	const upload = async (f) => {
		info.replaceChildren(h('div', { class: 'muted' }, t('Subiendo {0} ({1})…', f.name, fmtBytes(f.size))));
		const fd = new FormData();
		fd.append('sessionid', MOR.sid);
		fd.append('filename', '/tmp/myownrouter-upload.bin');
		fd.append('filemode', '0600');
		fd.append('filedata', f);
		const r = await fetch('/cgi-bin/cgi-upload', { method: 'POST', body: fd });
		if (!r.ok) throw new Error(t('Falló la subida ({0})', r.status));
		const c = await ubus('myownrouter', 'upgrade_check', {});
		if (!c.ok) { info.replaceChildren(note(t(c.error || 'Imagen inválida'), 'err')); return; }
		const keep = toggle(true);
		info.replaceChildren(h('div', { class: 'form' }, kv([[t('Archivo'), f.name], [t('Tamaño'), fmtBytes(c.size)], ['SHA256', h('span', { class: 'mono' }, c.sha256)]]),
			field(t('Conservar la configuración'), keep),
			h('div', { class: 'form-actions' }, btn(t('Instalar'), async () => {
				if (!(await confirmDlg(t('Instalar firmware'), t('El router se reinicia y no debe apagarse durante el proceso (2-3 minutos).'), t('Instalar'), true))) return;
				await api('upgrade_start', { keep: keep.checked });
				waitForRouter('', t('Instalando firmware… no apagues el equipo.'));
			}, 'primary'))));
	};
	return card(t('Actualización manual'), h('div', { class: 'form', style: { maxWidth: 'none' } },
		kv([[t('Versión actual'), s.system.release]]),
		note(t('Subí una imagen «squashfs-combined-efi.img.gz» de MyOwnRouter (o de OpenWrt x86/64). En una VM también podés tomar un snapshot antes desde el hipervisor.')),
		h('div', fileButton(t('Elegir archivo de firmware…'), '.img,.gz,.bin', upload)), info));
});

page('/tasks', t('Sistema · Tareas programadas'), async () => {
	const tasks = await uci.sections('myownrouter', 'task');
	const actions = { reboot: t('Reiniciar el router'), wifi_off: t('Apagar WiFi'), wifi_on: t('Encender WiFi') };
	const cronDays = (d) => !d || d === '*' ? t('Todos los días') : d.split(',').map(x => [t('Do'), t('Lu'), t('Ma'), t('Mi'), t('Ju'), t('Vi'), t('Sá')][+x]).join(' ');
	const add = async () => {
		const act = select(Object.entries(actions), 'reboot'), time = input('04:00', { type: 'time' }), days = daysPicker('');
		const r = await modal(t('Nueva tarea'), h('div', { class: 'form' }, field(t('Acción'), act), field(t('Hora'), time), field(t('Días'), days)),
			[[t('Cancelar'), null], [t('Crear'), async () => {
				const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
				const d = days.value.map(x => map[x]).sort();
				const [hh, mm] = time.value.split(':');
				await uci.add('myownrouter', 'task', 't_' + Date.now().toString(36), { action: act.value, hour: String(+hh), minute: String(+mm), days: d.length === 7 || !d.length ? '*' : d.join(','), enabled: '1' });
				await uci.commit('myownrouter'); await api('apply', { what: 'cron' });
				return true;
			}, 'primary']]);
		if (r) navigate();
	};
	return card(t('Tareas'), table([t('Acción'), t('Hora'), t('Días'), t('Activa'), ''], tasks.map(task => [actions[task.action] || task.action, String(task.hour).padStart(2, '0') + ':' + String(task.minute).padStart(2, '0'), cronDays(task.days),
		toggle(task.enabled === '1', async (on) => { await uci.save('myownrouter', task['.name'], { enabled: on ? '1' : '0' }); await api('apply', { what: 'cron' }); }),
		iconBtn('trash', t('Eliminar'), async () => { await uci.del('myownrouter', task['.name']); await uci.commit('myownrouter'); await api('apply', { what: 'cron' }); navigate(); }, 'danger')]), t('Sin tareas')),
	btn(t('Agregar tarea'), add, 'primary sm', 'plus'));
});

page('/time', t('Sistema · Fecha y hora'), async () => {
	const [sys, ntp, tz, st] = await Promise.all([uci.first('system', 'system'), uci.tryGet('system', 'ntp'), api('timezones'), api('status')]);
	const zone = select(tz.zones.map(z => [z[0], z[0]]), sys.zonename || 'UTC');
	const ntpOn = toggle(!ntp || ntp.enabled !== '0');
	const servers = input([].concat((ntp && ntp.server) || []).join(' '));
	return card(t('Zona horaria'), h('div', { class: 'form' },
		field(t('Hora del router'), new Date(st.system.localtime * 1000).toLocaleString()),
		field(t('Zona horaria'), zone), field(t('Sincronizar por NTP'), ntpOn), field(t('Servidores NTP'), servers),
		h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
			const spec = (tz.zones.find(z => z[0] === zone.value) || [])[1] || 'UTC0';
			await uci.save('system', sys['.name'], { zonename: zone.value, timezone: spec });
			if (ntp) await uci.save('system', 'ntp', { enabled: ntpOn.checked ? '1' : '0', server: servers.value.split(/[ ,]+/).filter(Boolean) });
			await api('apply', { what: 'system' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/logs', t('Sistema · Registros'), async () => {
	let kernel = false;
	const pre = h('pre', { class: 'log' });
	const tabs = h('div', { class: 'tabs' });
	const load = async () => {
		tabs.replaceChildren(h('button', { class: !kernel ? 'active' : '', onclick: () => { kernel = false; load(); } }, t('Sistema')),
			h('button', { class: kernel ? 'active' : '', onclick: () => { kernel = true; load(); } }, t('Kernel')));
		pre.textContent = (await api('log', { lines: 500, kernel })).log || t('(vacío)');
		pre.scrollTop = pre.scrollHeight;
	};
	await load();
	return card(t('Registros'), h('div', tabs, pre), h('span', { class: 'inline' }, btn(t('Actualizar'), load, 'sm', 'refresh'),
		btn(t('Descargar'), () => { const a = h('a', { href: URL.createObjectURL(new Blob([pre.textContent])), download: (kernel ? 'kernel' : 'system') + '.log' }); a.click(); }, 'sm')));
});

page('/diag', t('Sistema · Diagnóstico'), async () => {
	const tool = select([['ping', t('Ping')], ['traceroute', t('Traceroute')], ['nslookup', t('Nslookup')]], 'ping');
	const host = input('openwrt.org');
	const out = h('pre', { class: 'log' }, '');
	const speed = h('div');
	const showSpeed = (r) => speed.replaceChildren(r.result ? h('div', { class: 'grid c3' },
		h('div', h('div', { class: 'muted small' }, t('Bajada')), h('div', { class: 'stat-big' }, (+r.result.download).toFixed(1) + ' Mbps')),
		h('div', h('div', { class: 'muted small' }, t('Subida')), h('div', { class: 'stat-big' }, (+r.result.upload).toFixed(1) + ' Mbps')),
		h('div', h('div', { class: 'muted small' }, t('Latencia')), h('div', { class: 'stat-big' }, (+r.result.ping).toFixed(0) + ' ms'), h('div', { class: 'small muted' }, r.result.server || '')))
		: h('div', { class: 'muted' }, r.running ? t('Midiendo… (unos 30 segundos)') : t('Sin mediciones.')));
	showSpeed(await api('speedtest_result'));
	return [
		card(t('Herramientas de red'), h('div', h('div', { class: 'inline', style: { marginBottom: '12px' } }, tool, h('div', { style: { flex: 1, minWidth: '200px' } }, host),
			btn(t('Ejecutar'), async () => { out.textContent = t('Ejecutando…'); out.textContent = (await api('diag', { tool: tool.value, host: host.value })).output; }, 'primary')), out)),
		card(t('Test de velocidad'), speed, btn(t('Iniciar'), async () => {
			await api('speedtest_start');
			showSpeed({ running: true });
			const timer = setInterval(async () => {
				const r = await api('speedtest_result').catch(() => null);
				if (r && !r.running) { clearInterval(timer); showSpeed(r); }
			}, 3000);
			MOR.timers.push(timer);
		}, 'primary sm')),
	];
});

page('/security', t('Sistema · Seguridad'), async () => {
	const db = await uci.first('dropbear', 'dropbear');
	const cur = password(''), p1 = password(''), p2 = password('');
	const sshOn = toggle(db && db.enable !== '0'), sshPw = toggle(db && db.PasswordAuth !== 'off'), sshPort = input(db ? db.Port : '22', { type: 'number' });
	return [
		card(t('Contraseña de administrador'), h('div', { class: 'form' }, field(t('Actual'), cur), field(t('Nueva'), p1), field(t('Repetir'), p2),
			h('div', { class: 'form-actions' }, btn(t('Cambiar contraseña'), async () => {
				if (p1.value.length < 8) throw new Error(t('Mínimo 8 caracteres'));
				if (p1.value !== p2.value) throw new Error(t('Las contraseñas no coinciden'));
				try { await ubus('session', 'login', { username: 'root', password: cur.value, timeout: 60 }, NULL_SID); }
				catch (e) { throw new Error(t('La contraseña actual es incorrecta')); }
				await api('set_password', { password: p1.value });
				cur.value = p1.value = p2.value = '';
				toast('Contraseña cambiada', 'ok');
			}, 'primary')))),
		card('SSH', h('div', { class: 'form' }, field(t('Servidor SSH'), sshOn), field(t('Permitir contraseña'), sshPw, t('Si lo apagás, solo con clave pública (cargala en LuCI › Sistema › Administración)')), field(t('Puerto'), sshPort),
			h('div', { class: 'form-actions' }, btn(t('Guardar'), async () => {
				await uci.save('dropbear', db['.name'], { enable: sshOn.checked ? '1' : '0', PasswordAuth: sshPw.checked ? 'on' : 'off', RootPasswordAuth: sshPw.checked ? 'on' : 'off', Port: sshPort.value });
				await api('service', { name: 'dropbear', action: 'restart' });
				toast('Guardado', 'ok');
			}, 'primary')))),
	];
});

page('/reset', t('Sistema · Restablecer'), async () => card(t('Restablecer a valores de fábrica'), h('div', { class: 'form' },
	note(t('Borra toda la configuración (WiFi, VPN, reglas, contraseña) y reinicia. Después vas a entrar por la LAN en http://192.168.20.1 o por la IP WAN que asigne el router principal, y se vuelve a mostrar el asistente inicial.'), 'warn'),
	h('div', btn(t('Restablecer'), async () => {
		if (!(await confirmDlg(t('Restablecer'), t('Se borra toda la configuración. ¿Continuar?'), t('Restablecer'), true))) return;
		await api('factory_reset');
		waitForRouter('', t('Restableciendo y reiniciando…'));
	}, 'primary danger')))));

/* ================================================================== navigation */

MOR.nav = [
	{ path: '/home', title: t('Inicio'), icon: 'home' },
	{ title: t('Internet'), icon: 'globe', items: [['/internet', t('Conexión')], ['/repeater', t('Repetidor')], ['/multiwan', 'Multi-WAN']] },
	{ path: '/wireless', title: t('Inalámbrico'), icon: 'wifi' },
	{ path: '/clients', title: t('Clientes'), icon: 'users' },
	{ title: 'VPN', icon: 'shield', items: [['/vpn', t('Panel VPN')], ['/vpn-client', t('Clientes VPN')], ['/wg-server', t('Servidor WireGuard')], ['/tor', 'Tor']] },
	{ title: t('Aplicaciones'), icon: 'apps', items: [['/plugins', t('Complementos')], ['/adguard', 'AdGuard Home'], ['/ddns', t('DNS dinámico')], ['/nas', t('Almacenamiento en red')],
		['/parental', t('Control parental')], ['/zerotier', 'ZeroTier'], ['/tailscale', 'Tailscale']] },
	{ title: t('Red'), icon: 'net', items: [['/lan', t('LAN y DHCP')], ['/guest', t('Red de invitados')], ['/portfw', t('Reenvío de puertos')], ['/firewall', t('Firewall')], ['/dns', 'DNS'],
		['/upnp', 'UPnP'], ['/qos', 'QoS (SQM)'], ['/ipv6', 'IPv6'], ['/netadv', t('Avanzado')]] },
	{ title: t('Sistema'), icon: 'gear', items: [['/system', t('Resumen')], ['/upgrade', t('Actualizar firmware')], ['/tasks', t('Tareas programadas')], ['/time', t('Fecha y hora')],
		['/logs', t('Registros')], ['/diag', t('Diagnóstico')], ['/security', t('Seguridad')], ['/reset', t('Restablecer')], ['/cgi-bin/luci/', t('Configuración avanzada'), true]] },
];

boot();
