/* MyOwnRouter web UI — VPN, applications, network, system. SPDX-License-Identifier: GPL-2.0-only */
'use strict';

/* ================================================================== VPN */

page('/vpn', 'VPN · Panel', async () => {
	const [v, ws, ts, zt, st] = await Promise.all([api('vpn_list'), api('wgserver_get'), api('tailscale_status'), api('zerotier_status'), api('status')]);
	const active = v.clients.find(c => c.up || c.enabled);
	const quick = select([['', '— elegir perfil —'], ...v.clients.map(c => [c.id, c.name + ' (' + (c.type === 'wireguard' ? 'WireGuard' : 'OpenVPN') + ')'])], active ? active.id : '');
	return h('div', { class: 'grid c2' },
		card('Cliente VPN', h('div', { class: 'form' },
			active ? kv([['Perfil', h('b', active.name)], ['Tipo', active.type === 'wireguard' ? 'WireGuard' : 'OpenVPN'],
				['Estado', active.up ? badge('Conectado', 'ok') : badge('Conectando…', 'warn')]]) : h('div', { class: 'muted' }, 'Ninguna VPN cliente activa. Todo el tráfico sale directo por la WAN.'),
			v.clients.length ? h('div', { class: 'inline' }, quick,
				btn('Conectar', async () => { if (!quick.value) return; await api('vpn_connect', { id: quick.value, connect: true }); toast('Conectando…', 'ok'); setTimeout(navigate, 4000); }, 'primary'),
				active ? btn('Desconectar', async () => { await api('vpn_connect', { id: active.id, connect: false }); toast('Desconectado', 'ok'); setTimeout(navigate, 3000); }, 'danger') : null)
				: h('a', { href: '#/vpn-client' }, 'Agregar un perfil WireGuard u OpenVPN'))),
		card('Servidor WireGuard', kv([['Estado', ws.enabled ? badge('Activo', 'ok') : badge('Apagado')], ['Puerto', ws.port + '/udp'], ['Clientes', String(ws.peers.length)]]), h('a', { href: '#/wg-server' }, 'Configurar')),
		card('Tailscale', kv([['Estado', !ts.running ? badge('Apagado') : ts.backend_state === 'Running' ? badge('Conectado', 'ok') : badge(ts.backend_state || '—', 'warn')],
			['IP', ts.self && ts.self.ips ? ts.self.ips.join(', ') : '—']]), h('a', { href: '#/tailscale' }, 'Configurar')),
		card('ZeroTier / Tor', kv([['ZeroTier', zt.running ? badge('Activo', 'ok') : badge('Apagado')], ['Tor', st.apps.tor ? badge('Activo', 'ok') : badge('Apagado')]]),
			h('span', h('a', { href: '#/zerotier' }, 'ZeroTier'), ' · ', h('a', { href: '#/tor' }, 'Tor'))));
});

page('/vpn-client', 'VPN · Clientes', async () => {
	const v = await api('vpn_list');
	const pol = v.policy || {};
	const add = async () => {
		const type = select([['wireguard', 'WireGuard (.conf)'], ['openvpn', 'OpenVPN (.ovpn)']], 'wireguard');
		const name = input('', { placeholder: 'ej: casa, proton_ar', maxLength: 15 });
		const conf = h('textarea', { placeholder: 'Pegá la configuración o cargá el archivo' });
		const user = input(''), pass = password('');
		const auth = h('div', { class: 'form' }, field('Usuario', user), field('Contraseña', pass));
		const sync = () => { auth.style.display = type.value === 'openvpn' ? '' : 'none'; };
		type.addEventListener('change', sync); sync();
		const fb = fileButton('Cargar archivo…', '.conf,.ovpn,.txt', async (f) => {
			conf.value = await readFile(f);
			if (/\.ovpn$/i.test(f.name)) { type.value = 'openvpn'; sync(); }
			if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 15);
		});
		const r = await modal('Agregar perfil VPN', h('div', { class: 'form' }, field('Tipo', type), field('Nombre', name), h('div', fb), conf, auth),
			[['Cancelar', null], ['Agregar', async () => {
				await api('vpn_import', { type: type.value, name: name.value, config: conf.value, username: user.value, password: pass.value });
				return true;
			}, 'primary']], { wide: true });
		if (r) { toast('Perfil agregado', 'ok'); navigate(); }
	};
	const ks = toggle(pol.kill_switch === '1');
	return [
		card('Perfiles', table(['Nombre', 'Tipo', 'Servidor', 'Estado', ''], v.clients.map(c => [
			h('b', c.name), c.type === 'wireguard' ? 'WireGuard' : 'OpenVPN', c.endpoint || '—',
			c.up ? badge('Conectado', 'ok') : c.enabled ? badge('Conectando', 'warn') : badge('Desconectado'),
			h('span', { class: 'inline', style: { justifyContent: 'flex-end' } },
				c.enabled ? btn('Desconectar', async () => { await api('vpn_connect', { id: c.id, connect: false }); setTimeout(navigate, 2500); }, 'sm')
					: btn('Conectar', async () => { await api('vpn_connect', { id: c.id, connect: true }); toast('Conectando…', 'ok'); setTimeout(navigate, 4000); }, 'sm primary'),
				iconBtn('trash', 'Eliminar', async () => {
					if (await confirmDlg('Eliminar perfil', '¿Eliminar «' + c.name + '»?', 'Eliminar', true)) { await api('vpn_delete', { id: c.id }); navigate(); }
				}, 'danger'))]), 'Todavía no agregaste perfiles'), btn('Agregar perfil', add, 'primary sm', 'plus')),
		card('Política', h('div', { class: 'form' },
			note('Con un cliente VPN conectado, todo el tráfico de la LAN sale por el túnel (solo uno activo a la vez). La red de invitados sale siempre directo. Para reglas por dispositivo o por dominio usá «Policy Based Routing» en la configuración avanzada.'),
			field('Bloquear internet si la VPN cae (kill switch)', ks),
			h('div', { class: 'form-actions' },
				h('a', { class: 'btn', href: '/cgi-bin/luci/admin/services/pbr', target: '_blank' }, 'Reglas avanzadas (PBR)'),
				btn('Guardar', async () => { await api('vpn_policy_set', { mode: 'all', macs: [], kill_switch: ks.checked }); toast('Guardado', 'ok'); }, 'primary')))),
	];
});

page('/wg-server', 'VPN · Servidor WireGuard', async () => {
	const s = await api('wgserver_get');
	const en = toggle(s.enabled);
	const port = input(s.port, { type: 'number' });
	const addr = input(s.address);
	const ep = input(s.endpoint, { placeholder: 'mi-casa.duckdns.org o IP pública' });
	const full = toggle(s.full_tunnel);
	const show = async (p) => {
		const r = await api('wgserver_peer_conf', { name: p.name });
		const dl = () => { const a = h('a', { href: URL.createObjectURL(new Blob([r.config], { type: 'text/plain' })), download: p.name + '.conf' }); a.click(); };
		await modal('Cliente «' + p.name + '»', h('div', { class: 'grid c2' },
			h('div', { class: 'qr', html: r.qr_svg }),
			h('pre', { class: 'log', style: { fontSize: '11px' } }, r.config)), [['Descargar .conf', () => { dl(); return false; }], ['Cerrar', null]], { wide: true });
	};
	const addPeer = async () => {
		const n = input('', { placeholder: 'ej: celular', maxLength: 15 });
		const r = await modal('Nuevo cliente', field('Nombre', n), [['Cancelar', null], ['Crear', async () => { await api('wgserver_peer_add', { name: n.value }); return true; }, 'primary']]);
		if (r) { toast('Cliente creado', 'ok'); await navigate(); }
	};
	const ago = (t) => !t ? 'nunca' : fmtUptime(Date.now() / 1000 - t) + ' atrás';
	return [
		card('Servidor', h('div', { class: 'form' },
			field('Activar', en), field('Puerto UDP', port), field('Subred del túnel', addr),
			field('Dirección pública', ep, 'DNS dinámico o IP pública con la que te conectás desde afuera'),
			field('Todo el tráfico por el túnel', full, 'Si se apaga, los clientes solo acceden a la LAN'),
			s.public_key ? field('Clave pública', h('span', { class: 'mono' }, s.public_key)) : null,
			note('Este router está detrás de otro (WAN ' + (s.wan_ip || '?') + '). Para conectarte desde internet, reenviá el puerto ' + s.port + '/UDP del router principal hacia esa IP.', 'warn'),
			h('div', { class: 'form-actions' }, btn('Guardar', async () => {
				await api('wgserver_set', { enabled: en.checked, port: port.value, address: addr.value, endpoint: ep.value, full_tunnel: full.checked });
				toast('Servidor guardado', 'ok'); setTimeout(navigate, 1500);
			}, 'primary')))),
		card('Clientes', table(['Nombre', 'IP', 'Último contacto', 'Tráfico', ''], s.peers.map(p => [
			h('b', p.name), p.ip, ago(p.handshake), p.rx != null ? '↓ ' + fmtBytes(p.tx) + ' · ↑ ' + fmtBytes(p.rx) : '—',
			h('span', { class: 'inline', style: { justifyContent: 'flex-end' } }, btn('Ver / QR', () => show(p), 'sm'),
				iconBtn('trash', 'Eliminar', async () => { if (await confirmDlg('Eliminar cliente', '¿Eliminar «' + p.name + '»?', 'Eliminar', true)) { await api('wgserver_peer_del', { name: p.name }); navigate(); } }, 'danger'))]),
			'Sin clientes'), s.configured ? btn('Agregar cliente', addPeer, 'primary sm', 'plus') : null),
	];
});

page('/tor', 'VPN · Tor', async () => {
	const st = await api('status');
	const en = toggle(st.apps.tor, async (on) => { await api('tor_set', { enabled: on }); toast(on ? 'Tor activado (puede tardar un minuto en conectar)' : 'Tor desactivado', 'ok'); });
	return card('Tor', h('div', { class: 'form' }, field('Enviar el tráfico de la LAN por Tor', en),
		note('Todo el tráfico TCP y las consultas DNS de la LAN pasan por la red Tor (anónimo pero lento; UDP no funciona). Permite abrir direcciones .onion. Los invitados no se ven afectados.', 'warn')));
});

/* ================================================================== Applications */

page('/plugins', 'Aplicaciones · Complementos', async () => {
	const r = await api('packages');
	const q = input('', { placeholder: 'Buscar paquete…' });
	const body = h('div');
	const render = () => body.replaceChildren(table(['Paquete', 'Versión'], r.installed.filter(p => !q.value || p.name.includes(q.value)).map(p => [h('span', { class: 'mono' }, p.name), p.version])));
	q.addEventListener('input', render); render();
	return card(r.installed.length + ' paquetes instalados', h('div', h('div', { style: { marginBottom: '12px' } }, q), body),
		h('a', { class: 'btn primary sm', href: '/cgi-bin/luci/admin/system/package-manager', target: '_blank' }, 'Instalar más paquetes'));
});

page('/adguard', 'Aplicaciones · AdGuard Home', async () => {
	const [cfg, svc, lan] = await Promise.all([uci.tryGet('myownrouter', 'adguard'), api('service_status'), uci.get('network', 'lan')]);
	const on = cfg && cfg.enabled === '1';
	const url = 'http://' + lan.ipaddr + ':3000/';
	return card('AdGuard Home', h('div', { class: 'form' },
		field('Bloqueo de publicidad y rastreadores', toggle(on, async (v) => { await api('adguard_set', { enabled: v }); toast(v ? 'AdGuard Home activado' : 'AdGuard Home desactivado', 'ok'); setTimeout(navigate, 2500); })),
		field('Estado', svc.services.adguardhome ? badge('En ejecución', 'ok') : badge('Detenido')),
		on ? field('Panel de AdGuard', h('a', { href: url, target: '_blank' }, url)) : null,
		note('El DNS del router (dnsmasq) reenvía las consultas a AdGuard Home, que filtra y resuelve por DNS cifrado (Quad9 / Cloudflare). El panel de AdGuard solo es accesible desde la LAN y no tiene contraseña propia.')));
});

const DDNS_PROVIDERS = ['duckdns.org', 'dynu.com', 'dynv6.com', 'afraid.org-v2-token', 'desec.io', 'ydns.io', 'ipv64.net', 'now-dns.com', 'he.net', 'dyndns.org', 'no-ip.pl', 'namecheap.com', 'ovh.com', 'strato.com'];

page('/ddns', 'Aplicaciones · DNS dinámico', async () => {
	const d = (await uci.tryGet('ddns', 'mor')) || {};
	const en = toggle(d.enabled === '1');
	const svc = select(DDNS_PROVIDERS, d.service_name || 'duckdns.org');
	const dom = input(d.domain, { placeholder: 'micasa.duckdns.org' });
	const user = input(d.username, { placeholder: 'usuario (en DuckDNS: el dominio sin .duckdns.org)' });
	const pass = password(d.password, { placeholder: 'contraseña / token' });
	return card('DNS dinámico', h('div', { class: 'form' },
		field('Activar', en), field('Proveedor', svc), field('Dominio', dom), field('Usuario', user), field('Contraseña / token', pass),
		note('La IP pública se detecta consultando un servicio web, así funciona aunque este router esté detrás de otro (doble NAT).'),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			await uci.ensure('ddns', 'service', 'mor');
			await uci.save('ddns', 'mor', { enabled: en.checked ? '1' : '0', service_name: svc.value, domain: dom.value, lookup_host: dom.value,
				username: user.value, password: pass.value, interface: 'wan', ip_source: 'web', ip_url: 'https://api.ipify.org',
				use_https: '1', cacert: '/etc/ssl/certs', check_interval: '10', check_unit: 'minutes', use_ipv6: '0' });
			await api('service', { name: 'ddns', action: en.checked ? 'on' : 'off' });
			toast('DNS dinámico guardado', 'ok');
		}, 'primary'))));
});

page('/nas', 'Aplicaciones · Almacenamiento en red', async () => {
	const [s, svc] = await Promise.all([uci.tryGet('ksmbd', 'mor'), api('service_status')]);
	const sh = s || {};
	const en = toggle(!!s && svc.services.ksmbd);
	const name = input(sh.name || 'compartido'), path = input(sh.path || '/mnt/compartido');
	const ro = toggle(sh.read_only === 'yes');
	return card('Carpeta compartida (SMB)', h('div', { class: 'form' },
		field('Activar', en), field('Nombre del recurso', name), field('Carpeta en el router', path, 'Se crea si no existe. Para más espacio agregá un disco virtual a la VM y montalo ahí.'),
		field('Solo lectura', ro),
		note('Acceso de invitado (sin usuario) desde la LAN: \\\\' + (MOR.state.status ? MOR.state.status.lan.ipaddr : 'router') + '\\' + name.value),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			await uci.ensure('ksmbd', 'share', 'mor');
			await uci.save('ksmbd', 'mor', { name: name.value, path: path.value, read_only: ro.checked ? 'yes' : 'no', guest_ok: 'yes', create_mask: '0666', dir_mask: '0777', force_root: '1' });
			await api('apply', { what: 'samba_prepare' }).catch(() => {});
			await api('service', { name: 'ksmbd', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/parental', 'Aplicaciones · Control parental', async () => {
	const [rules, cl] = await Promise.all([uci.sections('firewall', 'rule'), api('clients')]);
	const mine = rules.filter(r => /^mor_pc_/.test(r['.name']));
	const cname = (mac) => { const c = cl.clients.find(x => x.mac === (mac || '').toLowerCase()); return c ? (c.name || c.hostname || mac) : mac; };
	const dayNames = { Mon: 'Lu', Tue: 'Ma', Wed: 'Mi', Thu: 'Ju', Fri: 'Vi', Sat: 'Sá', Sun: 'Do' };
	const add = async () => {
		const dev = select(cl.clients.map(c => [c.mac, (c.name || c.hostname || 'Desconocido') + ' · ' + c.mac]), '');
		const days = daysPicker('');
		const from = input('22:00', { type: 'time' }), to = input('07:00', { type: 'time' });
		const r = await modal('Bloqueo por horario', h('div', { class: 'form' }, field('Dispositivo', dev), field('Días', days), field('Bloquear desde', from), field('Hasta', to),
			note('Si el horario cruza la medianoche se crean dos reglas.')),
		[['Cancelar', null], ['Crear', async () => {
			if (!dev.value) throw new Error('Elegí un dispositivo');
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
	return card('Bloqueos por horario', h('div',
		table(['Dispositivo', 'Días', 'Horario', 'Activa', ''], mine.map(r => [
			h('b', cname([].concat(r.src_mac || [])[0])), (r.weekdays || 'todos').split(' ').map(d => dayNames[d] || d).join(' '),
			(r.start_time || '').slice(0, 5) + ' – ' + (r.stop_time || '').slice(0, 5),
			toggle(r.enabled !== '0', async (on) => { await uci.save('firewall', r['.name'], { enabled: on ? '1' : '0' }, 'firewall'); }),
			iconBtn('trash', 'Eliminar', async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]),
		'Sin reglas'),
		h('div', { class: 'small muted', style: { marginTop: '10px' } }, 'Para cortar internet a un dispositivo en el momento usá el interruptor «Internet» en Clientes.')),
	btn('Agregar regla', add, 'primary sm', 'plus'));
});

page('/zerotier', 'Aplicaciones · ZeroTier', async () => {
	const [z, cfg] = await Promise.all([api('zerotier_status'), uci.get('zerotier')]);
	const net = Object.values(cfg).find(s => s['.type'] === 'network');
	const en = toggle(cfg.global && cfg.global.enabled === '1');
	const nid = input(net ? net.id : '', { placeholder: 'ID de red (16 caracteres)', maxLength: 16 });
	return [card('ZeroTier', h('div', { class: 'form' }, field('Activar', en), field('ID de red', nid),
		note('Después de unirte, autorizá este equipo en el panel de ZeroTier (my.zerotier.com). La interfaz ZeroTier queda en la zona LAN.'),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			await api('zerotier_set', { enabled: en.checked, network_id: nid.value });
			toast('Guardado', 'ok'); setTimeout(navigate, 5000);
		}, 'primary')))),
	card('Estado', z.running ? h('div', kv([['Dirección del nodo', z.address], ['En línea', z.online ? 'Sí' : 'No']]),
		table(['Red', 'Nombre', 'Estado', 'IPs'], z.networks.map(n => [h('span', { class: 'mono' }, n.id), n.name || '—', n.status, (n.ips || []).join(', ')]), 'Sin redes'))
		: h('div', { class: 'muted' }, 'Detenido'))];
});

page('/tailscale', 'Aplicaciones · Tailscale', async () => {
	const t = await api('tailscale_status');
	const lanRoute = toggle(t.advertise_lan), exit = toggle(t.exit_node);
	const en = toggle(t.running);
	const stateBox = h('div');
	const paint = (t) => stateBox.replaceChildren(kv([
		['Servicio', t.running ? badge('En ejecución', 'ok') : badge('Detenido')],
		['Estado', t.backend_state === 'Running' ? badge('Conectado', 'ok') : (t.backend_state || '—')],
		['Equipo', t.self ? t.self.hostname : '—'], ['IPs Tailscale', t.self && t.self.ips ? t.self.ips.join(', ') : '—'], ['Otros equipos', String(t.peers)],
		['Inicio de sesión', t.auth_url ? h('a', { href: t.auth_url, target: '_blank' }, 'Autorizar este router en Tailscale ↗') : (t.backend_state === 'NeedsLogin' ? 'esperando enlace…' : '—')]]));
	paint(t);
	MOR.timers.push(setInterval(async () => { try { paint(await api('tailscale_status')); } catch (e) { /* */ } }, 4000));
	return [card('Tailscale', h('div', { class: 'form' },
		field('Activar', en), field('Compartir la LAN (subnet router)', lanRoute), field('Ofrecer como nodo de salida', exit),
		note('Las rutas y el nodo de salida hay que aprobarlos en el panel de Tailscale.'),
		h('div', { class: 'form-actions' },
			t.running ? btn('Cerrar sesión', async () => { await api('tailscale_set', { enabled: false, logout: true }); toast('Sesión cerrada', 'ok'); setTimeout(navigate, 3000); }, 'danger') : null,
			btn('Aplicar', async () => {
				await api('tailscale_set', { enabled: en.checked, advertise_lan: lanRoute.checked, exit_node: exit.checked });
				toast(en.checked ? 'Iniciando Tailscale… el enlace de autorización aparece en unos segundos' : 'Tailscale detenido', 'ok');
			}, 'primary')))),
	card('Estado', stateBox)];
});

/* ================================================================== Network */

page('/lan', 'Red · LAN y DHCP', async () => {
	const [lan, dh, hosts] = await Promise.all([uci.get('network', 'lan'), uci.get('dhcp', 'lan'), uci.sections('dhcp', 'host')]);
	const ip = input(lan.ipaddr), mask = select(['255.255.255.0', '255.255.0.0', '255.255.255.128'], lan.netmask || '255.255.255.0');
	const dhcpOn = toggle(dh.ignore !== '1');
	const start = input(dh.start, { type: 'number' }), limit = input(dh.limit, { type: 'number' });
	const lease = select([['1h', '1 hora'], ['6h', '6 horas'], ['12h', '12 horas'], ['24h', '1 día'], ['7d', '7 días']], dh.leasetime || '12h');
	const saveLan = async () => {
		const old = lan.ipaddr;
		await uci.save('dhcp', 'lan', { ignore: dhcpOn.checked ? '' : '1', start: start.value, limit: limit.value, leasetime: lease.value });
		if (ip.value !== old || mask.value !== lan.netmask) {
			if (!(await confirmDlg('Cambiar IP de la LAN', 'Los dispositivos de la LAN van a tener que renovar su IP (desconectar y reconectar).', 'Aplicar'))) return;
			await uci.save('network', 'lan', { ipaddr: ip.value, netmask: mask.value }, 'network');
			await api('apply', { what: 'dhcp' });
			if (location.hostname === old) return waitForRouter('http://' + ip.value, 'Cambiando la IP del router a ' + ip.value + '…');
		} else await api('apply', { what: 'dhcp' });
		toast('Guardado', 'ok');
	};
	const addHost = async () => {
		const cl = (await api('clients')).clients;
		const dev = select([['', 'Ingresar MAC manualmente'], ...cl.map(c => [c.mac, (c.name || c.hostname || '?') + ' · ' + c.mac])], '');
		const mac = input('', { placeholder: 'aa:bb:cc:dd:ee:ff' }), rip = input(subnetOf(lan.ipaddr), {}), nm = input('');
		dev.addEventListener('change', () => { if (dev.value) { mac.value = dev.value; const c = cl.find(x => x.mac === dev.value); nm.value = c.name || c.hostname || ''; if (c.ip) rip.value = c.ip; } });
		const r = await modal('Reservar IP', h('div', { class: 'form' }, field('Dispositivo', dev), field('MAC', mac), field('IP', rip), field('Nombre', nm)),
			[['Cancelar', null], ['Guardar', async () => { await api('client_set', { mac: mac.value, name: nm.value || undefined, reserved_ip: rip.value }); return true; }, 'primary']]);
		if (r) navigate();
	};
	return [
		card('Router en la LAN', h('div', { class: 'form' }, field('Dirección IP', ip), field('Máscara', mask),
			field('Servidor DHCP', dhcpOn), field('Primera dirección', start, 'Desde ' + subnetOf(ip.value) + start.value), field('Cantidad de direcciones', limit), field('Duración de la concesión', lease),
			h('div', { class: 'form-actions' }, btn('Guardar', saveLan, 'primary')))),
		card('Direcciones reservadas', table(['Nombre', 'MAC', 'IP', ''], hosts.map(x => [x.name || '—', h('span', { class: 'mono' }, [].concat(x.mac || []).join(' ')), x.ip,
			iconBtn('trash', 'Eliminar', async () => { await uci.del('dhcp', x['.name']); await uci.commit('dhcp'); await api('apply', { what: 'dhcp' }); navigate(); }, 'danger')]), 'Sin reservas'),
		btn('Agregar', addHost, 'primary sm', 'plus')),
	];
});

page('/portfw', 'Red · Reenvío de puertos', async () => {
	const [reds, cl, st] = await Promise.all([uci.sections('firewall', 'redirect'), api('clients'), api('status')]);
	const list = reds.filter(r => r.src === 'wan' && !/^mor_tor/.test(r['.name']));
	const add = async () => {
		const name = input('', { placeholder: 'ej: servidor-web' });
		const proto = select([['tcp udp', 'TCP y UDP'], ['tcp', 'TCP'], ['udp', 'UDP']], 'tcp');
		const ext = input('', { placeholder: '8080 o 8000-8010' });
		const dev = select([['', 'Elegir dispositivo…'], ...cl.clients.filter(c => c.ip).map(c => [c.ip, (c.name || c.hostname || '?') + ' · ' + c.ip])], '');
		const ip = input('', { placeholder: subnetOf(st.lan.ipaddr) + 'x' });
		dev.addEventListener('change', () => { if (dev.value) ip.value = dev.value; });
		const intp = input('', { placeholder: 'igual al externo' });
		const r = await modal('Nueva regla', h('div', { class: 'form' }, field('Nombre', name), field('Protocolo', proto), field('Puerto externo', ext), field('Dispositivo', dev), field('IP interna', ip), field('Puerto interno', intp)),
			[['Cancelar', null], ['Crear', async () => {
				if (!/^\d+(-\d+)?$/.test(ext.value) || !ip.value) throw new Error('Completá puerto externo e IP interna');
				await uci.add('firewall', 'redirect', 'mor_pf_' + Date.now().toString(36), { name: name.value || 'Reenvio-' + ext.value, src: 'wan', dest: 'lan', proto: proto.value.split(' '),
					src_dport: ext.value, dest_ip: ip.value, dest_port: intp.value || ext.value, target: 'DNAT', enabled: '1' });
				await uci.commit('firewall'); await api('apply', { what: 'firewall' });
				return true;
			}, 'primary']]);
		if (r) { toast('Regla creada', 'ok'); navigate(); }
	};
	return card('Reglas', h('div',
		table(['Nombre', 'Protocolo', 'Puerto externo', 'Destino', 'Activa', ''], list.map(r => [h('b', r.name || r['.name']), [].concat(r.proto || 'tcp udp').join(' ').toUpperCase(), r.src_dport || '—',
			(r.dest_ip || '') + ':' + (r.dest_port || r.src_dport || ''),
			toggle(r.enabled !== '0', async (on) => { await uci.save('firewall', r['.name'], { enabled: on ? '1' : '0' }, 'firewall'); }),
			iconBtn('trash', 'Eliminar', async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]), 'Sin reglas'),
		h('div', { style: { marginTop: '12px' } }, note('Recordá que este router está detrás de otro: el puerto también hay que reenviarlo en el router principal hacia ' + (st.internet.wan && st.internet.wan.ipaddr || 'la IP WAN') + '.', 'warn'))),
	btn('Agregar regla', add, 'primary sm', 'plus'));
});

page('/firewall', 'Red · Firewall', async () => {
	const [all, defs] = await Promise.all([uci.get('firewall'), uci.first('firewall', 'defaults')]);
	const rules = Object.values(all).filter(s => s['.type'] === 'rule');
	const open = rules.filter(r => /^mor_open_/.test(r['.name']));
	const ping = rules.find(r => r.name === 'Allow-Ping');
	const mgmt = all.wan_mgmt;
	const add = async () => {
		const name = input(''), proto = select([['tcp', 'TCP'], ['udp', 'UDP'], ['tcp udp', 'TCP y UDP']], 'tcp'), port = input('', { placeholder: '22 o 1000-2000' });
		const r = await modal('Abrir puerto en el router', h('div', { class: 'form' }, field('Nombre', name), field('Protocolo', proto), field('Puerto', port)),
			[['Cancelar', null], ['Abrir', async () => {
				if (!/^\d+(-\d+)?$/.test(port.value)) throw new Error('Puerto inválido');
				await uci.add('firewall', 'rule', 'mor_open_' + Date.now().toString(36), { name: name.value || 'Abrir-' + port.value, src: 'wan', proto: proto.value.split(' '), dest_port: port.value, target: 'ACCEPT', enabled: '1' });
				await uci.commit('firewall'); await api('apply', { what: 'firewall' }); return true;
			}, 'primary']]);
		if (r) navigate();
	};
	const fsave = async (sec, vals) => { await uci.save('firewall', sec, vals, 'firewall'); toast('Aplicado', 'ok'); };
	return [
		card('Acceso desde la WAN', h('div', { class: 'form' },
			field('Administración desde redes privadas de la WAN', toggle(mgmt && mgmt.enabled !== '0', (on) => fsave('wan_mgmt', { enabled: on ? '1' : '0' })), 'Web (80/443) y SSH desde 10.x, 172.16-31.x y 192.168.x del lado WAN'),
			field('Responder ping desde la WAN', toggle(ping && ping.enabled !== '0', (on) => ping && fsave(ping['.name'], { enabled: on ? '1' : '0' }))),
			field('Protección SYN flood', toggle(defs && defs.synflood_protect === '1', (on) => fsave(defs['.name'], { synflood_protect: on ? '1' : '0' }))),
			note('Si desactivás la administración desde la WAN, solo vas a poder entrar al router desde la LAN o la WiFi.', 'warn'))),
		card('Puertos abiertos en el router', table(['Nombre', 'Protocolo', 'Puerto', ''], open.map(r => [r.name, [].concat(r.proto).join(' ').toUpperCase(), r.dest_port,
			iconBtn('trash', 'Cerrar', async () => { await uci.del('firewall', r['.name']); await uci.commit('firewall'); await api('apply', { what: 'firewall' }); navigate(); }, 'danger')]), 'Ninguno'),
			btn('Abrir puerto', add, 'primary sm', 'plus')),
		card(null, h('div', { class: 'inline' }, 'Zonas, reglas de tráfico y NAT avanzadas:', h('a', { href: '/cgi-bin/luci/admin/network/firewall', target: '_blank' }, 'Firewall en LuCI ↗'))),
	];
});

const DNS_PRESETS = [['', 'Personalizado'], ['1.1.1.1 1.0.0.1', 'Cloudflare'], ['8.8.8.8 8.8.4.4', 'Google'], ['9.9.9.9 149.112.112.112', 'Quad9'], ['94.140.14.14 94.140.15.15', 'AdGuard DNS'], ['208.67.222.222 208.67.220.220', 'OpenDNS']];

page('/dns', 'Red · DNS', async () => {
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
	return card('Servidores DNS', h('div', { class: 'form' },
		agh && agh.enabled === '1' ? note('AdGuard Home está activo: las consultas pasan por AdGuard; los servidores de abajo se usan solo si lo apagás.', 'warn') : null,
		field('DNS manuales', manual, 'Si está apagado se usan los que entrega la WAN'),
		field('Proveedor', preset), field('Servidores', list),
		field('Protección contra DNS rebinding', rebind),
		field('Forzar el DNS del router', force, 'Redirige al router las consultas DNS de la LAN dirigidas a otros servidores'),
		h('div', { class: 'form-actions' }, btn('Guardar', save, 'primary'))));
});

page('/upnp', 'Red · UPnP', async () => {
	const u = await uci.get('upnpd', 'config');
	const en = toggle(u.enabled === '1'), sec = toggle(u.secure_mode !== '0');
	return card('UPnP / NAT-PMP', h('div', { class: 'form' }, field('Activar', en), field('Modo seguro', sec, 'Cada dispositivo solo puede abrir puertos hacia sí mismo'),
		note('Permite que consolas y aplicaciones abran puertos automáticamente. Con doble NAT solo abre puertos en este router.'),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			await uci.save('upnpd', 'config', { enabled: en.checked ? '1' : '0', secure_mode: sec.checked ? '1' : '0' });
			await api('service', { name: 'miniupnpd', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/qos', 'Red · QoS (SQM)', async () => {
	const [s, st] = await Promise.all([uci.tryGet('sqm', 'mor'), api('status')]);
	const q = s || {};
	const en = toggle(q.enabled === '1');
	const down = input(q.download ? Math.round(q.download / 1000) : '', { type: 'number', placeholder: 'Mbps' });
	const up = input(q.upload ? Math.round(q.upload / 1000) : '', { type: 'number', placeholder: 'Mbps' });
	return card('Control de cola inteligente', h('div', { class: 'form' },
		field('Activar', en), field('Bajada (Mbps)', down), field('Subida (Mbps)', up),
		note('SQM (cake) reduce la latencia cuando la conexión está saturada (videollamadas y juegos mientras se descarga). Poné ~90 % de tu velocidad real medida (ver Sistema › Diagnóstico › Test de velocidad).'),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			if (en.checked && (!+down.value || !+up.value)) throw new Error('Completá las velocidades');
			await uci.ensure('sqm', 'queue', 'mor');
			await uci.save('sqm', 'mor', { enabled: en.checked ? '1' : '0', interface: (st.internet.wan && st.internet.wan.device) || 'eth0',
				download: String(Math.round(+down.value * 1000)), upload: String(Math.round(+up.value * 1000)), qdisc: 'cake', script: 'piece_of_cake.qos', linklayer: 'none' });
			await api('service', { name: 'sqm', action: en.checked ? 'on' : 'off' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/ipv6', 'Red · IPv6', async () => {
	const [w6, lan, dh, st] = await Promise.all([uci.tryGet('network', 'wan6'), uci.get('network', 'lan'), uci.get('dhcp', 'lan'), api('status')]);
	const on = w6 && w6.disabled !== '1' && dh.ra !== 'disabled';
	const en = toggle(on);
	return card('IPv6', h('div', { class: 'form' }, field('Activar IPv6', en),
		kv([['Direcciones WAN', (st.internet.wan && st.internet.wan.ip6 || []).join(', ') || '—'], ['Direcciones LAN', (st.lan && st.lan.ip6 || []).join(', ') || '—']]),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			if (w6) await uci.save('network', 'wan6', { disabled: en.checked ? '' : '1' });
			await uci.save('network', 'lan', { ip6assign: en.checked ? '60' : '' });
			await uci.save('dhcp', 'lan', { ra: en.checked ? 'server' : 'disabled', dhcpv6: en.checked ? 'server' : 'disabled' });
			await api('apply', { what: 'ipv6' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/netadv', 'Red · Avanzado', async () => {
	const [defs, glob, br] = await Promise.all([uci.first('firewall', 'defaults'), uci.tryGet('network', 'globals'), uci.tryGet('network', 'br_lan')]);
	return [card('Rendimiento', h('div', { class: 'form' },
		field('Aceleración (flow offloading)', toggle(defs.flow_offloading === '1', async (on) => { await uci.save('firewall', defs['.name'], { flow_offloading: on ? '1' : '0' }, 'firewall'); toast('Aplicado', 'ok'); }),
			'Las conexiones establecidas saltean parte del firewall: más rendimiento con menos CPU'),
		field('Distribuir paquetes entre CPUs', toggle(glob && glob.packet_steering === '1', async (on) => { await uci.save('network', 'globals', { packet_steering: on ? '1' : '0' }, 'network'); toast('Aplicado', 'ok'); })),
		field('IGMP snooping (multicast/IPTV)', toggle(br && br.igmp_snooping === '1', async (on) => { await uci.save('network', 'br_lan', { igmp_snooping: on ? '1' : '0' }, 'network'); toast('Aplicado', 'ok'); })))),
	card(null, h('div', { class: 'inline' }, 'Interfaces, VLAN, rutas estáticas y más:', h('a', { href: '/cgi-bin/luci/admin/network/network', target: '_blank' }, 'Red en LuCI ↗')))];
});

/* ================================================================== System */

page('/system', 'Sistema · Resumen', async () => {
	const [s, sys] = await Promise.all([api('status'), uci.first('system', 'system')]);
	const hn = input(sys.hostname);
	return [card('Equipo', kv([
		['Modelo', s.system.model], ['Firmware', s.system.release], ['Kernel', s.system.kernel], ['Tiempo encendido', fmtUptime(s.system.uptime)],
		['Hora del router', new Date(s.system.localtime * 1000).toLocaleString()], ['CPUs', String(s.system.cpus)],
		['Carga', s.system.load.map(x => x.toFixed(2)).join(' / ')],
		['Memoria', fmtBytes(s.system.memory.total - s.system.memory.available) + ' usados de ' + fmtBytes(s.system.memory.total)],
		['Almacenamiento', fmtBytes(s.system.storage.used) + ' usados de ' + fmtBytes(s.system.storage.total)],
		['MAC WAN', s.internet.wan && s.internet.wan.mac], ['MAC LAN', s.lan && s.lan.mac]]),
		btn('Reiniciar', async () => {
			if (await confirmDlg('Reiniciar', '¿Reiniciar el router ahora? Se corta la conexión por un minuto.', 'Reiniciar', true)) { await api('reboot'); waitForRouter('', 'Reiniciando…'); }
		}, 'danger sm')),
	card('Nombre del router', h('div', { class: 'form' }, field('Nombre', hn), h('div', { class: 'form-actions' }, btn('Guardar', async () => {
		await uci.save('system', sys['.name'], { hostname: hn.value }, 'system'); toast('Guardado', 'ok');
	}, 'primary'))))];
});

page('/upgrade', 'Sistema · Actualizar firmware', async () => {
	const s = await api('status');
	const info = h('div');
	const upload = async (f) => {
		info.replaceChildren(h('div', { class: 'muted' }, 'Subiendo ' + f.name + ' (' + fmtBytes(f.size) + ')…'));
		const fd = new FormData();
		fd.append('sessionid', MOR.sid);
		fd.append('filename', '/tmp/myownrouter-upload.bin');
		fd.append('filemode', '0600');
		fd.append('filedata', f);
		const r = await fetch('/cgi-bin/cgi-upload', { method: 'POST', body: fd });
		if (!r.ok) throw new Error('Falló la subida (' + r.status + ')');
		const c = await ubus('myownrouter', 'upgrade_check', {});
		if (!c.ok) { info.replaceChildren(note(c.error || 'Imagen inválida', 'err')); return; }
		const keep = toggle(true);
		info.replaceChildren(h('div', { class: 'form' }, kv([['Archivo', f.name], ['Tamaño', fmtBytes(c.size)], ['SHA256', h('span', { class: 'mono' }, c.sha256)]]),
			field('Conservar la configuración', keep),
			h('div', { class: 'form-actions' }, btn('Instalar', async () => {
				if (!(await confirmDlg('Instalar firmware', 'El router se reinicia y no debe apagarse durante el proceso (2-3 minutos).', 'Instalar', true))) return;
				await api('upgrade_start', { keep: keep.checked });
				waitForRouter('', 'Instalando firmware… no apagues el equipo.');
			}, 'primary'))));
	};
	return card('Actualización manual', h('div', { class: 'form', style: { maxWidth: 'none' } },
		kv([['Versión actual', s.system.release]]),
		note('Subí una imagen «squashfs-combined-efi.img.gz» de MyOwnRouter (o de OpenWrt x86/64). En una VM también podés tomar un snapshot antes desde el hipervisor.'),
		h('div', fileButton('Elegir archivo de firmware…', '.img,.gz,.bin', upload)), info));
});

page('/tasks', 'Sistema · Tareas programadas', async () => {
	const tasks = await uci.sections('myownrouter', 'task');
	const actions = { reboot: 'Reiniciar el router', wifi_off: 'Apagar WiFi', wifi_on: 'Encender WiFi' };
	const cronDays = (d) => !d || d === '*' ? 'Todos los días' : d.split(',').map(x => ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'][+x]).join(' ');
	const add = async () => {
		const act = select(Object.entries(actions), 'reboot'), time = input('04:00', { type: 'time' }), days = daysPicker('');
		const r = await modal('Nueva tarea', h('div', { class: 'form' }, field('Acción', act), field('Hora', time), field('Días', days)),
			[['Cancelar', null], ['Crear', async () => {
				const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
				const d = days.value.map(x => map[x]).sort();
				const [hh, mm] = time.value.split(':');
				await uci.add('myownrouter', 'task', 't_' + Date.now().toString(36), { action: act.value, hour: String(+hh), minute: String(+mm), days: d.length === 7 || !d.length ? '*' : d.join(','), enabled: '1' });
				await uci.commit('myownrouter'); await api('apply', { what: 'cron' });
				return true;
			}, 'primary']]);
		if (r) navigate();
	};
	return card('Tareas', table(['Acción', 'Hora', 'Días', 'Activa', ''], tasks.map(t => [actions[t.action] || t.action, String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0'), cronDays(t.days),
		toggle(t.enabled === '1', async (on) => { await uci.save('myownrouter', t['.name'], { enabled: on ? '1' : '0' }); await api('apply', { what: 'cron' }); }),
		iconBtn('trash', 'Eliminar', async () => { await uci.del('myownrouter', t['.name']); await uci.commit('myownrouter'); await api('apply', { what: 'cron' }); navigate(); }, 'danger')]), 'Sin tareas'),
	btn('Agregar tarea', add, 'primary sm', 'plus'));
});

page('/time', 'Sistema · Fecha y hora', async () => {
	const [sys, ntp, tz, st] = await Promise.all([uci.first('system', 'system'), uci.tryGet('system', 'ntp'), api('timezones'), api('status')]);
	const zone = select(tz.zones.map(z => [z[0], z[0]]), sys.zonename || 'UTC');
	const ntpOn = toggle(!ntp || ntp.enabled !== '0');
	const servers = input([].concat((ntp && ntp.server) || []).join(' '));
	return card('Zona horaria', h('div', { class: 'form' },
		field('Hora del router', new Date(st.system.localtime * 1000).toLocaleString()),
		field('Zona horaria', zone), field('Sincronizar por NTP', ntpOn), field('Servidores NTP', servers),
		h('div', { class: 'form-actions' }, btn('Guardar', async () => {
			const spec = (tz.zones.find(z => z[0] === zone.value) || [])[1] || 'UTC0';
			await uci.save('system', sys['.name'], { zonename: zone.value, timezone: spec });
			if (ntp) await uci.save('system', 'ntp', { enabled: ntpOn.checked ? '1' : '0', server: servers.value.split(/[ ,]+/).filter(Boolean) });
			await api('apply', { what: 'system' });
			toast('Guardado', 'ok');
		}, 'primary'))));
});

page('/logs', 'Sistema · Registros', async () => {
	let kernel = false;
	const pre = h('pre', { class: 'log' });
	const tabs = h('div', { class: 'tabs' });
	const load = async () => {
		tabs.replaceChildren(h('button', { class: !kernel ? 'active' : '', onclick: () => { kernel = false; load(); } }, 'Sistema'),
			h('button', { class: kernel ? 'active' : '', onclick: () => { kernel = true; load(); } }, 'Kernel'));
		pre.textContent = (await api('log', { lines: 500, kernel })).log || '(vacío)';
		pre.scrollTop = pre.scrollHeight;
	};
	await load();
	return card('Registros', h('div', tabs, pre), h('span', { class: 'inline' }, btn('Actualizar', load, 'sm', 'refresh'),
		btn('Descargar', () => { const a = h('a', { href: URL.createObjectURL(new Blob([pre.textContent])), download: (kernel ? 'kernel' : 'system') + '.log' }); a.click(); }, 'sm')));
});

page('/diag', 'Sistema · Diagnóstico', async () => {
	const tool = select([['ping', 'Ping'], ['traceroute', 'Traceroute'], ['nslookup', 'Nslookup']], 'ping');
	const host = input('openwrt.org');
	const out = h('pre', { class: 'log' }, '');
	const speed = h('div');
	const showSpeed = (r) => speed.replaceChildren(r.result ? h('div', { class: 'grid c3' },
		h('div', h('div', { class: 'muted small' }, 'Bajada'), h('div', { class: 'stat-big' }, (+r.result.download).toFixed(1) + ' Mbps')),
		h('div', h('div', { class: 'muted small' }, 'Subida'), h('div', { class: 'stat-big' }, (+r.result.upload).toFixed(1) + ' Mbps')),
		h('div', h('div', { class: 'muted small' }, 'Latencia'), h('div', { class: 'stat-big' }, (+r.result.ping).toFixed(0) + ' ms'), h('div', { class: 'small muted' }, r.result.server || '')))
		: h('div', { class: 'muted' }, r.running ? 'Midiendo… (unos 30 segundos)' : 'Sin mediciones.'));
	showSpeed(await api('speedtest_result'));
	return [
		card('Herramientas de red', h('div', h('div', { class: 'inline', style: { marginBottom: '12px' } }, tool, h('div', { style: { flex: 1, minWidth: '200px' } }, host),
			btn('Ejecutar', async () => { out.textContent = 'Ejecutando…'; out.textContent = (await api('diag', { tool: tool.value, host: host.value })).output; }, 'primary')), out)),
		card('Test de velocidad', speed, btn('Iniciar', async () => {
			await api('speedtest_start');
			showSpeed({ running: true });
			const t = setInterval(async () => {
				const r = await api('speedtest_result').catch(() => null);
				if (r && !r.running) { clearInterval(t); showSpeed(r); }
			}, 3000);
			MOR.timers.push(t);
		}, 'primary sm')),
	];
});

page('/security', 'Sistema · Seguridad', async () => {
	const db = await uci.first('dropbear', 'dropbear');
	const cur = password(''), p1 = password(''), p2 = password('');
	const sshOn = toggle(db && db.enable !== '0'), sshPw = toggle(db && db.PasswordAuth !== 'off'), sshPort = input(db ? db.Port : '22', { type: 'number' });
	return [
		card('Contraseña de administrador', h('div', { class: 'form' }, field('Actual', cur), field('Nueva', p1), field('Repetir', p2),
			h('div', { class: 'form-actions' }, btn('Cambiar contraseña', async () => {
				if (p1.value.length < 8) throw new Error('Mínimo 8 caracteres');
				if (p1.value !== p2.value) throw new Error('Las contraseñas no coinciden');
				try { await ubus('session', 'login', { username: 'root', password: cur.value, timeout: 60 }, NULL_SID); }
				catch (e) { throw new Error('La contraseña actual es incorrecta'); }
				await api('set_password', { password: p1.value });
				cur.value = p1.value = p2.value = '';
				toast('Contraseña cambiada', 'ok');
			}, 'primary')))),
		card('SSH', h('div', { class: 'form' }, field('Servidor SSH', sshOn), field('Permitir contraseña', sshPw, 'Si lo apagás, solo con clave pública (cargala en LuCI › Sistema › Administración)'), field('Puerto', sshPort),
			h('div', { class: 'form-actions' }, btn('Guardar', async () => {
				await uci.save('dropbear', db['.name'], { enable: sshOn.checked ? '1' : '0', PasswordAuth: sshPw.checked ? 'on' : 'off', RootPasswordAuth: sshPw.checked ? 'on' : 'off', Port: sshPort.value });
				await api('service', { name: 'dropbear', action: 'restart' });
				toast('Guardado', 'ok');
			}, 'primary')))),
	];
});

page('/reset', 'Sistema · Restablecer', async () => card('Restablecer a valores de fábrica', h('div', { class: 'form' },
	note('Borra toda la configuración (WiFi, VPN, reglas, contraseña) y reinicia. Después vas a entrar por la LAN en http://192.168.20.1 o por la IP WAN que asigne el router principal, y se vuelve a mostrar el asistente inicial.', 'warn'),
	h('div', btn('Restablecer', async () => {
		if (!(await confirmDlg('Restablecer', 'Se borra toda la configuración. ¿Continuar?', 'Restablecer', true))) return;
		await api('factory_reset');
		waitForRouter('', 'Restableciendo y reiniciando…');
	}, 'primary danger')))));

/* ================================================================== navigation */

MOR.nav = [
	{ path: '/home', title: 'Inicio', icon: 'home' },
	{ title: 'Internet', icon: 'globe', items: [['/internet', 'Conexión'], ['/repeater', 'Repetidor'], ['/multiwan', 'Multi-WAN']] },
	{ path: '/wireless', title: 'Inalámbrico', icon: 'wifi' },
	{ path: '/clients', title: 'Clientes', icon: 'users' },
	{ title: 'VPN', icon: 'shield', items: [['/vpn', 'Panel VPN'], ['/vpn-client', 'Clientes VPN'], ['/wg-server', 'Servidor WireGuard'], ['/tor', 'Tor']] },
	{ title: 'Aplicaciones', icon: 'apps', items: [['/plugins', 'Complementos'], ['/adguard', 'AdGuard Home'], ['/ddns', 'DNS dinámico'], ['/nas', 'Almacenamiento en red'],
		['/parental', 'Control parental'], ['/zerotier', 'ZeroTier'], ['/tailscale', 'Tailscale']] },
	{ title: 'Red', icon: 'net', items: [['/lan', 'LAN y DHCP'], ['/guest', 'Red de invitados'], ['/portfw', 'Reenvío de puertos'], ['/firewall', 'Firewall'], ['/dns', 'DNS'],
		['/upnp', 'UPnP'], ['/qos', 'QoS (SQM)'], ['/ipv6', 'IPv6'], ['/netadv', 'Avanzado']] },
	{ title: 'Sistema', icon: 'gear', items: [['/system', 'Resumen'], ['/upgrade', 'Actualizar firmware'], ['/tasks', 'Tareas programadas'], ['/time', 'Fecha y hora'],
		['/logs', 'Registros'], ['/diag', 'Diagnóstico'], ['/security', 'Seguridad'], ['/reset', 'Restablecer'], ['/cgi-bin/luci/', 'Configuración avanzada', true]] },
];

boot();
