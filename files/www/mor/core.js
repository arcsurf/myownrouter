/* MyOwnRouter web UI — core (api, layout, widgets). SPDX-License-Identifier: GPL-2.0-only */
'use strict';

const NULL_SID = '00000000000000000000000000000000';
const MOR = {
	sid: sessionStorage.getItem('mor_sid') || null,
	pages: {},
	nav: [],
	timers: [],
	state: {},
};

/* ------------------------------------------------------------------ DOM */

function h(tag, attrs, ...kids) {
	const el = document.createElement(tag);
	if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
		kids.unshift(attrs);
		attrs = null;
	}
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v == null || v === false) continue;
		if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else if (k === 'class') el.className = v;
		else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
		else if (k === 'html') el.innerHTML = v;
		else if (k in el && k !== 'list' && k !== 'type') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
		else el.setAttribute(k, v === true ? '' : v);
	}
	const add = (c) => {
		if (c == null || c === false) return;
		if (Array.isArray(c)) c.forEach(add);
		else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
	};
	kids.forEach(add);
	return el;
}

const ICONS = {
	home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
	wifi: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.3" r=".9" fill="currentColor"/>',
	users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.6 3.1-5.5 6.5-5.5s6 1.9 6.5 5.5"/><path d="M16 4.8a3.4 3.4 0 0 1 0 6.4"/><path d="M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
	shield: '<path d="M12 3l8 3v6c0 4.6-3.3 8-8 9-4.7-1-8-4.4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
	apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
	net: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2.5" y="16" width="6" height="5" rx="1"/><rect x="15.5" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/>',
	gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
	logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
	router: '<rect x="2.5" y="13" width="19" height="7" rx="2"/><path d="M6.5 16.5h.01M10 16.5h.01"/><path d="M15 13V7"/><path d="M11.5 6.5a5 5 0 0 1 7 0"/>',
	refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
	edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
	eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
	x: '<path d="M6 6l12 12M18 6L6 18"/>',
	chev: '<path d="M9 6l6 6-6 6"/>',
	menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
	cable: '<path d="M7 3v5M12 3v5M17 3v5"/><rect x="5" y="8" width="14" height="6" rx="1"/><path d="M12 14v7"/>',
	lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
	ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
	cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
	up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
	down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
	ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
};

function icon(name, cls) {
	const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
	s.innerHTML = ICONS[name] || '';
	return s;
}

/* ------------------------------------------------------------------ format */

function fmtBytes(b) {
	b = +b || 0;
	const u = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
	return (i ? b.toFixed(b < 10 ? 2 : 1) : b) + ' ' + u[i];
}

function fmtRate(bps) {
	bps = (+bps || 0) * 8;
	if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
	if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
	if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' Kbps';
	return bps.toFixed(0) + ' bps';
}

function fmtUptime(s) {
	s = +s || 0;
	const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	if (d) return `${d} d ${hh} h ${m} min`;
	if (hh) return `${hh} h ${m} min`;
	return `${m} min ${Math.floor(s % 60)} s`;
}

function bandName(b) { return { '2g': '2,4 GHz', '5g': '5 GHz', '6g': '6 GHz' }[b] || b; }

function prefixToMask(p) {
	p = +p;
	const m = p ? (0xffffffff << (32 - p)) >>> 0 : 0;
	return [24, 16, 8, 0].map(s => (m >>> s) & 255).join('.');
}

function subnetOf(ip) { return (ip || '').replace(/\.\d+$/, '.'); }

/* ------------------------------------------------------------------ RPC */

let rpcSeq = 0;

class RpcError extends Error {}

async function ubus(obj, method, args, sid) {
	let res;
	try {
		res = await fetch('/ubus', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcSeq, method: 'call', params: [sid || MOR.sid || NULL_SID, obj, method, args || {}] }),
		});
	} catch (e) {
		throw new RpcError('Sin conexión con el router');
	}
	const j = await res.json().catch(() => null);
	if (!j) throw new RpcError('Respuesta inválida del router');
	if (j.error) {
		if (j.error.code === -32002 && sid !== NULL_SID && obj !== 'session') { sessionExpired(); }
		throw new RpcError(j.error.message || 'Error');
	}
	const [code, data] = j.result;
	if (code === 6 && obj !== 'session') { sessionExpired(); throw new RpcError('Sesión expirada'); }
	if (code === 4) throw new RpcError('No encontrado');
	if (code !== 0) throw new RpcError('Error ' + code + ' en ' + obj + '.' + method);
	return data || {};
}

async function api(method, args) {
	const r = await ubus('myownrouter', method, args);
	if (r && r.ok === false) throw new RpcError(r.error || 'Error');
	return r;
}

const uci = {
	async get(config, section) {
		const r = await ubus('uci', 'get', section ? { config, section } : { config });
		return r.values || {};
	},
	async tryGet(config, section) {
		try { return await uci.get(config, section); } catch (e) { return null; }
	},
	async sections(config, type) {
		const all = await uci.get(config);
		return Object.values(all).filter(s => !type || s['.type'] === type).sort((a, b) => (a['.index'] || 0) - (b['.index'] || 0));
	},
	async ensure(config, type, name) {
		if (!(await uci.tryGet(config, name))) await uci.add(config, type, name, {});
	},
	async first(config, type) {
		return (await uci.sections(config, type))[0] || null;
	},
	set(config, section, values) { return ubus('uci', 'set', { config, section, values }); },
	add(config, type, name, values) { return ubus('uci', 'add', name ? { config, type, name, values } : { config, type, values }); },
	del(config, section, option) {
		return ubus('uci', 'delete', option ? { config, section, option } : { config, section }).catch(e => { if (e.message !== 'No encontrado') throw e; });
	},
	commit(config) { return ubus('uci', 'commit', { config }); },
	async save(config, section, values, apply) {
		const del = Object.keys(values).filter(k => values[k] === '' || values[k] == null || (Array.isArray(values[k]) && !values[k].length));
		const set = {};
		for (const [k, v] of Object.entries(values)) if (!del.includes(k)) set[k] = v;
		if (Object.keys(set).length) await uci.set(config, section, set);
		for (const k of del) await uci.del(config, section, k);
		await uci.commit(config);
		if (apply) await api('apply', { what: apply });
	},
};

/* ------------------------------------------------------------------ widgets */

function toast(msg, kind) {
	let box = document.querySelector('.toasts');
	if (!box) { box = h('div', { class: 'toasts' }); document.body.appendChild(box); }
	const t = h('div', { class: 'toast ' + (kind || '') }, msg);
	box.appendChild(t);
	setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
}

function errToast(e) { toast(e && e.message ? e.message : String(e), 'err'); }

function btn(label, onclick, cls, ico) {
	const b = h('button', { class: 'btn ' + (cls || ''), type: 'button' }, ico ? icon(ico) : null, label);
	if (onclick) b.addEventListener('click', async (ev) => {
		ev.preventDefault();
		if (b.disabled) return;
		const prev = Array.from(b.childNodes);
		b.disabled = true;
		b.replaceChildren(h('span', { class: 'spin' }), label || '');
		try { await onclick(ev, b); } catch (e) { errToast(e); }
		finally { b.disabled = false; b.replaceChildren(...prev); }
	});
	return b;
}

function iconBtn(ico, title, onclick, cls) {
	const b = btn('', onclick, 'icon sm ' + (cls || ''), ico);
	b.title = title;
	return b;
}

function toggle(checked, onchange, disabled) {
	const i = h('input', { type: 'checkbox' });
	i.checked = !!checked;
	i.disabled = !!disabled;
	if (onchange) i.addEventListener('change', async () => {
		i.disabled = true;
		try { await onchange(i.checked, i); } catch (e) { i.checked = !i.checked; errToast(e); }
		finally { i.disabled = !!disabled; }
	});
	const l = h('label', { class: 'switch' }, i, h('span'));
	l.input = i;
	Object.defineProperty(l, 'checked', { get: () => i.checked, set: (v) => { i.checked = v; } });
	return l;
}

function input(value, attrs) {
	return h('input', Object.assign({ type: 'text', value: value ?? '' }, attrs || {}));
}

function password(value, attrs) {
	const i = h('input', Object.assign({ type: 'password', value: value ?? '', autocomplete: 'new-password' }, attrs || {}));
	const b = h('button', { type: 'button', title: 'Mostrar', onclick: () => { i.type = i.type === 'password' ? 'text' : 'password'; } }, icon('eye'));
	const w = h('div', { class: 'pw' }, i, b);
	Object.defineProperty(w, 'value', { get: () => i.value, set: (v) => { i.value = v; } });
	w.input = i;
	return w;
}

function select(options, value, attrs) {
	const s = h('select', attrs || {});
	for (const o of options) {
		const [v, l] = Array.isArray(o) ? o : [o, o];
		const opt = h('option', { value: v }, l);
		if (String(v) === String(value)) opt.selected = true;
		s.appendChild(opt);
	}
	return s;
}

function field(label, control, help) {
	return h('div', { class: 'field' }, h('label', label), control, help ? h('div', { class: 'help' }, help) : null);
}

function card(title, body, actions, opts) {
	return h('section', Object.assign({ class: 'card' }, opts || {}),
		title || actions ? h('div', { class: 'card-head' }, title ? h('h2', title) : null, actions ? h('div', { class: 'actions' }, actions) : null) : null,
		body);
}

function badge(text, kind) { return h('span', { class: 'badge ' + (kind || '') }, text); }

function note(text, kind) { return h('div', { class: 'note ' + (kind || '') }, text); }

function kv(pairs) {
	const d = h('div', { class: 'kv' });
	for (const [k, v] of pairs) if (v !== undefined) d.append(h('div', k), h('div', v ?? '—'));
	return d;
}

function table(cols, rows, emptyText) {
	const t = h('table', { class: 't' },
		h('thead', h('tr', cols.map(c => h('th', c)))),
		h('tbody', rows.length ? rows.map(r => h('tr', r.map((c, i) => h('td', i === r.length - 1 && cols[i] === '' ? { class: 'actions' } : null, c))))
			: h('tr', h('td', { colspan: cols.length, class: 'empty' }, emptyText || 'Sin elementos'))));
	return h('div', { class: 'table-wrap' }, t);
}

function modal(title, body, buttons, opts) {
	return new Promise((resolve) => {
		const close = (v) => { ov.remove(); document.removeEventListener('keydown', esc); resolve(v); };
		const esc = (e) => { if (e.key === 'Escape') close(null); };
		const foot = h('div', { class: 'modal-foot' });
		for (const b of buttons || [['Cerrar', null]]) {
			const [label, fn, cls] = b;
			foot.appendChild(btn(label, async () => {
				if (!fn) return close(null);
				const r = await fn();
				if (r !== false) close(r === undefined ? true : r);
			}, cls));
		}
		const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov && !(opts && opts.sticky)) close(null); } },
			h('div', { class: 'modal' + (opts && opts.wide ? ' wide' : '') },
				h('div', { class: 'modal-head' }, title, h('button', { class: 'btn icon sm', type: 'button', onclick: () => close(null) }, icon('x'))),
				h('div', { class: 'modal-body' }, body), foot));
		document.addEventListener('keydown', esc);
		document.body.appendChild(ov);
		const f = ov.querySelector('input,select,textarea');
		if (f) setTimeout(() => f.focus(), 30);
	});
}

function confirmDlg(title, text, okLabel, danger) {
	return modal(title, h('p', { style: { margin: 0, lineHeight: 1.5 } }, text), [['Cancelar', null], [okLabel || 'Aceptar', () => true, danger ? 'primary danger' : 'primary']]);
}

function every(ms, fn) {
	fn();
	const t = setInterval(fn, ms);
	MOR.timers.push(t);
	return t;
}

function readFile(file) {
	return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

function fileButton(label, accept, onfile) {
	const i = h('input', { type: 'file', accept, style: { display: 'none' } });
	i.addEventListener('change', async () => { if (i.files[0]) { try { await onfile(i.files[0]); } catch (e) { errToast(e); } i.value = ''; } });
	const b = h('button', { class: 'btn', type: 'button', onclick: () => i.click() }, label);
	return h('span', i, b);
}

function daysPicker(value) {
	const names = [['Mon', 'Lu'], ['Tue', 'Ma'], ['Wed', 'Mi'], ['Thu', 'Ju'], ['Fri', 'Vi'], ['Sat', 'Sá'], ['Sun', 'Do']];
	const sel = (value || '').split(/[ ,]+/).filter(Boolean);
	const boxes = names.map(([v, l]) => {
		const c = h('input', { type: 'checkbox', value: v });
		c.checked = !sel.length || sel.includes(v);
		return [c, h('label', c, h('span', l))];
	});
	const w = h('div', { class: 'days' }, boxes.map(b => b[1]));
	Object.defineProperty(w, 'value', { get: () => boxes.filter(b => b[0].checked).map(b => b[0].value) });
	return w;
}

/* ------------------------------------------------------------------ session */

function sessionExpired() {
	if (!MOR.sid) return;
	MOR.sid = null;
	sessionStorage.removeItem('mor_sid');
	stopTimers();
	renderLogin('La sesión expiró, volvé a ingresar.');
}

async function login(pw) {
	const r = await ubus('session', 'login', { username: 'root', password: pw, timeout: 4 * 3600 }, NULL_SID);
	if (!r.ubus_rpc_session) throw new RpcError('Contraseña incorrecta');
	MOR.sid = r.ubus_rpc_session;
	sessionStorage.setItem('mor_sid', MOR.sid);
}

async function logout() {
	try { await ubus('session', 'destroy', {}); } catch (e) { /* ignore */ }
	MOR.sid = null;
	sessionStorage.removeItem('mor_sid');
	stopTimers();
	renderLogin();
}

function stopTimers() {
	MOR.timers.forEach(clearInterval);
	MOR.timers = [];
}

/* ------------------------------------------------------------------ login / welcome */

async function renderLogin(msg) {
	const app = document.getElementById('app');
	let st = {};
	try { st = await ubus('myownrouter', 'state', {}, NULL_SID); } catch (e) { /* router unreachable */ }
	if (st.needs_setup) return renderWelcome(st);
	const pw = password('', { placeholder: 'Contraseña de administrador', autocomplete: 'current-password' });
	const err = h('div', { class: 'err' }, msg || '');
	const go = async () => {
		err.textContent = '';
		try { await login(pw.value); boot(); }
		catch (e) { err.textContent = e.message === 'Access denied' || e.message === 'Contraseña incorrecta' ? 'Contraseña incorrecta' : e.message; }
	};
	pw.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
	app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'box' },
		h('img', { src: '/mor/logo.svg', alt: '' }),
		h('h1', st.hostname || 'MyOwnRouter'),
		h('p', { class: 'sub' }, 'Ingresá la contraseña de administrador'),
		h('div', { class: 'form' }, pw, err, btn('Iniciar sesión', go, 'primary')),
	)));
	setTimeout(() => pw.input.focus(), 50);
}

function renderWelcome(st) {
	const app = document.getElementById('app');
	const p1 = password('', { placeholder: 'Mínimo 8 caracteres' });
	const p2 = password('', { placeholder: 'Repetir contraseña' });
	const ssid = input('', { placeholder: 'Nombre de la red WiFi', maxLength: 32 });
	const key = password('', { placeholder: 'Mínimo 8 caracteres' });
	const err = h('div', { class: 'err' });
	const body = h('div');
	const box = h('div', { class: 'box' });
	let step = 1;
	const steps = () => h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i', { class: step > 1 ? 'on' : '' }));
	const show = () => {
		err.textContent = '';
		if (step === 1) {
			body.replaceChildren(steps(), h('h1', 'Bienvenido'), h('p', { class: 'sub' }, 'Elegí la contraseña de administrador del router'),
				h('div', { class: 'form' }, field('Contraseña', p1), field('Confirmar', p2), err,
					btn('Siguiente', () => {
						if (p1.value.length < 8) { err.textContent = 'Debe tener al menos 8 caracteres'; return; }
						if (p1.value !== p2.value) { err.textContent = 'Las contraseñas no coinciden'; return; }
						step = 2; show();
					}, 'primary')));
		} else {
			body.replaceChildren(steps(), h('h1', 'Red WiFi'), h('p', { class: 'sub' }, 'Configurá la red inalámbrica principal (podés cambiarla después)'),
				h('div', { class: 'form' }, field('Nombre (SSID)', ssid), field('Contraseña WiFi', key), err,
					btn('Finalizar', async () => {
						if (ssid.value && key.value.length < 8) { err.textContent = 'La contraseña WiFi debe tener al menos 8 caracteres'; return; }
						try {
							await login('');
							await api('setup', { password: p1.value, ssid: ssid.value, key: key.value });
							await login(p1.value);
							toast('Router configurado', 'ok');
							location.hash = '#/home';
							boot();
						} catch (e) { err.textContent = e.message; }
					}, 'primary'),
					h('button', { class: 'btn', type: 'button', onclick: () => { step = 1; show(); } }, 'Atrás')));
		}
	};
	box.append(h('img', { src: '/mor/logo.svg', alt: '' }), body);
	app.replaceChildren(h('div', { class: 'login' }, box));
	show();
}

/* ------------------------------------------------------------------ layout / routing */

function page(path, title, render) {
	MOR.pages[path] = { title, render };
}

function renderLayout() {
	const app = document.getElementById('app');
	const nav = h('nav', { class: 'nav' });
	for (const g of MOR.nav) {
		if (g.path) {
			nav.appendChild(h('div', { class: 'nav-group single', 'data-path': g.path },
				h('a', { class: 'nav-head', href: '#' + g.path, style: { textDecoration: 'none' } }, icon(g.icon), g.title)));
			continue;
		}
		const grp = h('div', { class: 'nav-group' },
			h('div', { class: 'nav-head', onclick: () => grp.classList.toggle('open') }, icon(g.icon), g.title, icon('chev', 'chev')),
			h('div', { class: 'nav-sub' }, g.items.map(([p, t, ext]) => ext
				? h('a', { href: p, target: '_blank', rel: 'noopener' }, t, ' ↗')
				: h('a', { href: '#' + p, 'data-path': p }, t))));
		nav.appendChild(grp);
	}
	const layout = h('div', { class: 'layout' },
		h('aside', { class: 'side' },
			h('div', { class: 'brand' }, h('img', { src: '/mor/logo.svg', alt: '' }), h('div', 'MyOwnRouter', h('small', { id: 'brand-sub' }, ''))),
			nav,
			h('div', { class: 'side-foot', id: 'side-foot' }, '')),
		h('div', { class: 'main' },
			h('header', { class: 'top' },
				h('button', { class: 'menu-btn', onclick: () => layout.classList.toggle('menu-open') }, icon('menu')),
				h('h1', { id: 'page-title' }, ''),
				h('div', { class: 'spacer' }),
				h('span', { id: 'net-pill' }),
				btn('Salir', logout, 'sm', 'logout')),
			h('main', { class: 'content', id: 'content' })));
	app.replaceChildren(layout);
	MOR.layout = layout;
}

async function navigate() {
	if (!MOR.sid) return;
	stopTimers();
	let path = location.hash.replace(/^#/, '') || '/home';
	if (!MOR.pages[path]) path = '/home';
	const pg = MOR.pages[path];
	document.getElementById('page-title').textContent = pg.title;
	document.title = pg.title + ' · MyOwnRouter';
	MOR.layout.classList.remove('menu-open');
	document.querySelectorAll('.nav a[data-path]').forEach(a => a.classList.toggle('active', a.dataset.path === path));
	document.querySelectorAll('.nav-group').forEach(g => {
		const act = !!g.querySelector(`a[data-path="${path}"]`) || g.dataset.path === path;
		g.classList.toggle('active', act);
		if (act) g.classList.add('open');
	});
	const c = document.getElementById('content');
	c.replaceChildren(h('div', { class: 'muted' }, 'Cargando…'));
	try {
		const node = await pg.render();
		c.replaceChildren(...(Array.isArray(node) ? node : [node]));
	} catch (e) {
		c.replaceChildren(card('Error', note(e.message || String(e), 'err')));
	}
	window.scrollTo(0, 0);
}

async function refreshPill() {
	try {
		const s = await api('status');
		MOR.state.status = s;
		const pill = document.getElementById('net-pill');
		if (pill) pill.replaceChildren(s.internet.online ? badge('● Conectado a internet', 'ok') : badge('● Sin internet', 'err'));
		const sub = document.getElementById('brand-sub');
		if (sub) sub.textContent = s.system.release ? s.system.release.replace(/^OpenWrt /, 'OpenWrt ').replace(/ r\d.*$/, '') : '';
		const foot = document.getElementById('side-foot');
		if (foot) foot.textContent = 'LAN ' + (s.lan && s.lan.ipaddr || '') + ' · ' + (s.system.hostname || '');
	} catch (e) { /* ignore */ }
}

async function boot() {
	if (!MOR.sid) return renderLogin();
	try { await ubus('session', 'access', { scope: 'ubus', object: 'myownrouter', function: 'status' }); }
	catch (e) { return renderLogin(); }
	renderLayout();
	refreshPill();
	setInterval(() => { if (MOR.sid) refreshPill(); }, 15000);
	window.onhashchange = navigate;
	navigate();
}

/* wait until the router answers again (after reboot / network change) */
async function waitForRouter(url, msg) {
	const ov = h('div', { class: 'overlay' }, h('div', { class: 'modal' }, h('div', { class: 'modal-body', style: { textAlign: 'center', padding: '30px' } },
		h('div', { class: 'spin', style: { width: '30px', height: '30px', border: '3px solid var(--accent)', borderRightColor: 'transparent', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin .8s linear infinite' } }),
		h('div', msg || 'Aplicando cambios…'))));
	document.body.appendChild(ov);
	const base = url || '';
	await new Promise(r => setTimeout(r, 8000));
	for (let i = 0; i < 90; i++) {
		try {
			const r = await fetch(base + '/mor/logo.svg?' + Date.now(), { cache: 'no-store', mode: base ? 'no-cors' : 'same-origin' });
			if (r.ok || r.type === 'opaque') break;
		} catch (e) { /* down */ }
		await new Promise(r => setTimeout(r, 2000));
	}
	if (base) location.href = base + '/';
	else location.reload();
}
