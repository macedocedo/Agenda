(function () {
  'use strict';
  var S = { alunos: [], aulas: [] }, armed = null, lastSig = '', notified = {}, filtro = '', editing = null, editPag = null, hist = false;
  var IC = { ok: '✅', chuva: '☔', mudou: '📅', faltou: '❌' }, RL = { ok: 'Realizada', chuva: 'Chuva', mudou: 'Mudou a data', faltou: 'Não foi' }, CANC = { chuva: 1, mudou: 1, faltou: 1 };
  try {
    var raw = localStorage.getItem('skate');
    if (raw) { var p = JSON.parse(raw); if (p && Array.isArray(p.alunos) && Array.isArray(p.aulas)) S = p; }
  } catch (e) {}

  S.pag = S.pag || {};
  S.cfg = Object.assign({ antes: 60, faltaConta: true, pm: 'Oi {nome}! Fechamos mais 4 aulas de skate ({datas}). Pode me enviar o pagamento? 🛹' }, S.cfg || {});

  function $(i) { return document.getElementById(i); }
  function save() { try { localStorage.setItem('skate', JSON.stringify(S)); } catch (e) { erro('Não foi possível salvar neste navegador.'); } }
  function erro(m, good) { $('err').className = good ? 'good' : ''; $('err').textContent = m; if (m) setTimeout(function () { if ($('err').textContent === m) $('err').textContent = ''; }, 5000); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fd(d) { var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function today() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
  function nowT() { var n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); }
  function addDays(d, n) { var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function aluno(id) { return S.alunos.find(function (a) { return a.id === id; }); }
  function nome(a) { var al = aluno(a.aluno); return al ? al.nome : '?'; }
  function msg(a) {
    var al = aluno(a.aluno) || { nome: '' };
    var v = { nome: al.nome, hora: a.hora, local: a.local || 'o local combinado', data: fd(a.data) };
    return a.msg.replace(/\{(nome|hora|local|data)\}/g, function (m, k) { return v[k]; });
  }
  function fone(v) {
    var t = v.replace(/\D/g, '').replace(/^0+/, '');
    if (t.length >= 10 && t.length <= 11) t = '55' + t;
    return t.length >= 12 && t.length <= 15 ? t : null;
  }
  function expire() {
    var d = today(), ch = false;
    S.aulas.forEach(function (a) { if (a.status === 'agendada' && a.data < d) { a.status = 'expirada'; ch = true; } });
    if (ch) save();
  }
  function due() {
    var d = today(), t = nowT();
    return S.aulas.filter(function (a) { return a.status === 'agendada' && !a.res && a.data === d && a.lembrete <= t; });
  }
  function sig() { return today() + '|' + due().map(function (a) { return a.id; }).join(',') + '|' + pagDue().map(function (c) { return c.key; }).join(','); }
  function notify(a) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification('Lembrete de aula 🛹', { body: 'Aprove o envio para ' + nome(a) }); } catch (e) {}
  }

  function addAluno() {
    var n = $('an').value.trim(), t = fone($('at').value);
    if (!n || !t) { erro('Informe o nome e o WhatsApp com DDD (ex.: 19999998888).'); return; }
    S.alunos.push({ id: uid(), nome: n, tel: t });
    $('an').value = ''; $('at').value = ''; erro(''); save(); render();
  }
  function addAula() {
    var al = $('ls').value, d = $('ld').value, h = $('lh').value, r = $('lr').value, m = $('lm').value.trim();
    if (!al) { erro('Cadastre um aluno primeiro.'); return; }
    if (!d || !h || !r) { erro('Preencha a data, a hora da aula e a hora do lembrete.'); return; }
    if (d < today()) { erro('Escolha uma data de hoje em diante.'); return; }
    if (!m) { erro('Escreva a mensagem do lembrete.'); return; }
    var dias = Array.prototype.slice.call(document.querySelectorAll('.dw:checked')).map(function (c) { return +c.value; });
    var datas = [];
    if (!dias.length) datas.push(d);
    else {
      var fim = $('lf').value || addDays(d, 84), max = addDays(d, 365);
      if (fim < d) { erro('A data final precisa ser igual ou depois da data da aula.'); return; }
      if (fim > max) fim = max;
      for (var x = d; x <= fim; x = addDays(x, 1)) {
        if (dias.indexOf(new Date(x + 'T12:00:00').getDay()) > -1) datas.push(x);
      }
      if (!datas.length) { erro('Nenhum dos dias escolhidos cai entre as datas.'); return; }
    }
    var local = $('ll').value.trim(), n = 0;
    datas.forEach(function (x, i) {
      var dup = S.aulas.some(function (a) { return a.aluno === al && a.data === x && a.hora === h && a.status === 'agendada'; });
      if (dup) return;
      S.aulas.push({ id: uid() + i, aluno: al, data: x, hora: h, local: local, lembrete: r, msg: m, status: 'agendada' });
      n++;
    });
    save(); render();
    erro(n ? n + (n === 1 ? ' aula marcada.' : ' aulas marcadas.') : 'Essas aulas já estavam marcadas.', !!n);
  }
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    var enc = new TextEncoder(), out = '', cur = '', len = 0;
    Array.from(line).forEach(function (ch) {
      var n = enc.encode(ch).length;
      if (len + n > 73) { out += cur + '\r\n '; cur = ''; len = 1; }
      cur += ch; len += n;
    });
    return out + cur;
  }
  function icsLocal(d, h, add) {
    var x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +h.slice(0, 2), +h.slice(3, 5) + add);
    return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00';
  }
  function mins(t) { return +t.slice(0, 2) * 60 + +t.slice(3, 5); }
  function novas(a) { return a.exp !== (a.seq || 0); }
  function listaFiltrada() {
    var d0 = today();
    return S.aulas.filter(function (a) { return a.status === 'agendada' && !a.res && a.data >= d0 && aluno(a.aluno) && (!filtro || a.aluno === filtro); });
  }
  function cancelsFiltrados() {
    var d0 = today();
    return (S.cancel || []).filter(function (c) { return c.data >= d0 && (!filtro || c.aluno === filtro); });
  }
  function exportIcs(onlyNew) {
    var l = listaFiltrada().filter(function (a) { return !onlyNew || novas(a); }), cs = cancelsFiltrados(), pc = pagCal(onlyNew);
    if (!l.length && !cs.length && !pc.length) { erro(onlyNew ? 'Nada novo ou alterado para exportar.' : 'Não há aulas futuras para exportar.'); return; }
    var stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Skate//PT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Aulas de Skate'];
    l.forEach(function (a) {
      var al = aluno(a.aluno), url = 'https://wa.me/' + al.tel + '?text=' + encodeURIComponent(msg(a));
      var diff = mins(a.hora) - mins(a.lembrete);
      L.push('BEGIN:VEVENT', 'UID:' + a.id + '@agenda-skate', 'DTSTAMP:' + stamp, 'SEQUENCE:' + (a.seq || 0), 'STATUS:CONFIRMED',
        'DTSTART:' + icsLocal(a.data, a.hora, 0), 'DTEND:' + icsLocal(a.data, a.hora, 60),
        'SUMMARY:' + icsText('Aula de skate - ' + al.nome),
        'LOCATION:' + icsText(a.local || ''),
        'DESCRIPTION:' + icsText('Toque no link para enviar o lembrete pelo WhatsApp:\n' + url + '\n\nMensagem: ' + msg(a)),
        'URL:' + url,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Aprovar e enviar lembrete para ' + al.nome),
        'TRIGGER:' + (diff > 0 ? '-PT' + diff + 'M' : 'PT0S'), 'END:VALARM');
      if (S.cfg.antes && S.cfg.antes !== diff) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Aula de ' + al.nome + ' em ' + (S.cfg.antes >= 60 ? S.cfg.antes / 60 + ' h' : S.cfg.antes + ' min')),
          'TRIGGER:-PT' + S.cfg.antes + 'M', 'END:VALARM');
      }
      L.push('END:VEVENT');
    });
    cs.forEach(function (c) {
      L.push('BEGIN:VEVENT', 'UID:' + c.id + '@agenda-skate', 'DTSTAMP:' + stamp, 'SEQUENCE:' + c.seq, 'STATUS:CANCELLED',
        'DTSTART:' + icsLocal(c.data, c.hora, 0), 'DTEND:' + icsLocal(c.data, c.hora, 60),
        'SUMMARY:' + icsText('Aula de skate - ' + c.nome), 'END:VEVENT');
    });
    pc.forEach(function (c) {
      var url = plink(c);
      L.push('BEGIN:VEVENT', 'UID:pay-' + c.key + '@agenda-skate', 'DTSTAMP:' + stamp, 'SEQUENCE:' + (c.st.seq || 0),
        'DTSTART;VALUE=DATE:' + c.data.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(c.data, 1).replace(/-/g, ''),
        'SUMMARY:' + icsText('💰 Cobrar pagamento - ' + c.al.nome),
        'DESCRIPTION:' + icsText('Fechou 4 aulas. Toque no link para cobrar pelo WhatsApp:\n' + url),
        'URL:' + url,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Aprovar cobrança de ' + c.al.nome), 'TRIGGER:PT8H', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    var blob = new Blob([L.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var u = URL.createObjectURL(blob), lnk = document.createElement('a');
    lnk.href = u; lnk.download = 'aulas-skate.ics'; document.body.appendChild(lnk); lnk.click(); lnk.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
    l.forEach(function (a) { a.exp = a.seq || 0; });
    pc.forEach(function (c) { var s = stget(c.key); s.ev = (s.seq || 0) + '|' + c.data; });
    S.cancel = (S.cancel || []).filter(function (c) { return cs.indexOf(c) < 0; });
    save(); render();
    erro(l.length + ' aula(s), ' + pc.length + ' pagamento(s) e ' + cs.length + ' cancelamento(s) no arquivo.', true);
  }
  function removeAulas(fn) {
    S.cancel = S.cancel || [];
    S.aulas = S.aulas.filter(function (a) {
      if (!fn(a)) return true;
      if (a.exp !== undefined && a.data >= today()) S.cancel.push({ id: a.id, aluno: a.aluno, nome: nome(a), data: a.data, hora: a.hora, seq: (a.seq || 0) + 1 });
      return false;
    });
  }
  function formEdit(a) {
    return '<div class="it ed"><div class="tx"><b>' + esc(nome(a)) + '</b>' +
      '<div class="row"><div><label for="ed-d">Data</label><input type="date" id="ed-d" value="' + a.data + '"></div>' +
      '<div><label for="ed-h">Hora da aula</label><input type="time" id="ed-h" value="' + a.hora + '"></div></div>' +
      '<div class="row"><div><label for="ed-l">Local</label><input id="ed-l" value="' + esc(a.local || '') + '"></div>' +
      '<div><label for="ed-r">Lembrete às</label><input type="time" id="ed-r" value="' + a.lembrete + '"></div></div></div>' +
      '<div class="btns"><button class="g x" data-act="cancE">Cancelar</button>' +
      '<button class="ok x" data-act="saveE" data-id="' + a.id + '">Salvar</button></div></div>';
  }
  function saveEdit(id) {
    var a = S.aulas.find(function (x) { return x.id === id; }); if (!a) return;
    var d = $('ed-d').value, h = $('ed-h').value, r = $('ed-r').value, lc = $('ed-l').value.trim();
    if (!d || !h || !r) { erro('Preencha data, hora da aula e hora do lembrete.'); return; }
    var mudouData = d !== a.data;
    if (mudouData && d < today()) { erro('Escolha uma data de hoje em diante.'); return; }
    var tempo = d !== a.data || h !== a.hora || r !== a.lembrete;
    if (tempo || lc !== (a.local || '')) {
      if (mudouData) {
        a.rem = { de: (a.rem && a.rem.de) || a.data, motivo: a.res === 'chuva' ? 'chuva' : (a.res === 'mudou' ? 'mudou' : (a.rem ? a.rem.motivo : 'mudou')) };
        if (a.res === 'chuva' || a.res === 'mudou') delete a.res;
      }
      a.data = d; a.hora = h; a.lembrete = r; a.local = lc; a.seq = (a.seq || 0) + 1;
      if (tempo) { a.status = 'agendada'; delete notified[a.id]; }
    }
    editing = null; save(); render(); erro('Aula atualizada.', true);
  }

  function stget(k) { return S.pag[k] || (S.pag[k] = {}); }
  function ciclos() {
    var out = [];
    S.alunos.forEach(function (al) {
      var arr = S.aulas.filter(function (a) { return a.aluno === al.id && (!a.res || a.res === 'ok' || (a.res === 'faltou' && S.cfg.faltaConta)); })
        .sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); });
      for (var k = 0; k * 4 < arr.length; k++) {
        var it = arr.slice(k * 4, k * 4 + 4), key = al.id + '_' + k, st = S.pag[key] || {}, comp = it.length === 4;
        out.push({ key: key, al: al, n: k + 1, it: it, comp: comp, st: st, data: comp ? (st.data || it[3].data) : null });
      }
    });
    return out;
  }
  function aberto(c) { return c.comp && !c.st.pago && !c.st.cobrado && !c.st.skip; }
  function pagDue() { var d = today(); return ciclos().filter(function (c) { return aberto(c) && c.data <= d; }); }
  function pnovo(c) { return c.st.ev !== (c.st.seq || 0) + '|' + c.data; }
  function pagCal(onlyNew) {
    var d = today();
    return ciclos().filter(function (c) { return aberto(c) && c.data >= d && (!filtro || c.al.id === filtro) && (!onlyNew || pnovo(c)); });
  }
  function pmsg(c) {
    var v = { nome: c.al.nome, datas: c.it.map(function (a) { return fd(a.data).slice(0, 5); }).join(', '), data: fd(c.data) };
    return (S.cfg.pm || '').replace(/\{(nome|datas|data)\}/g, function (m, k) { return v[k]; });
  }
  function plink(c) { return 'https://wa.me/' + c.al.tel + '?text=' + encodeURIComponent(pmsg(c)); }
  function formPag(c) {
    return '<div class="it ed"><div class="tx"><b>' + esc(c.al.nome) + '</b> · Pacote ' + c.n +
      '<label for="ep-d">Data do pagamento</label><input type="date" id="ep-d" value="' + c.data + '"></div>' +
      '<div class="btns"><button class="g x" data-act="cancP">Cancelar</button><button class="ok x" data-act="saveP" data-id="' + c.key + '">Salvar</button></div></div>';
  }
  function savePag(key) {
    var d = $('ep-d').value;
    if (!d) { erro('Escolha a data do pagamento.'); return; }
    var s = stget(key); s.data = d; s.seq = (s.seq || 0) + 1; delete s.skip; delete s.cobrado;
    editPag = null; save(); render(); erro('Data do pagamento atualizada.', true);
  }
  function setRes(id, v) {
    var a = S.aulas.find(function (x) { return x.id === id; }); if (!a) return;
    var old = a.res, nv = old === v ? undefined : v;
    if ((old && CANC[old]) || (nv && CANC[nv])) {
      a.seq = (a.seq || 0) + 1;
      if (nv && CANC[nv] && a.exp !== undefined && a.data >= today()) {
        (S.cancel = S.cancel || []).push({ id: a.id, aluno: a.aluno, nome: nome(a), data: a.data, hora: a.hora, seq: a.seq });
        a.exp = undefined;
      }
    }
    if (nv) a.res = nv; else delete a.res;
    editing = (nv === 'chuva' || nv === 'mudou') ? id : null;
    save(); render();
  }

  function setStatus(id, st) { var a = S.aulas.find(function (x) { return x.id === id; }); if (a) { a.status = st; save(); } }
  function delAluno(id) {
    if (armed !== id) {
      armed = id; render();
      setTimeout(function () { if (armed === id) { armed = null; render(); } }, 3000);
      return;
    }
    armed = null;
    removeAulas(function (a) { return a.aluno === id; });
    S.alunos = S.alunos.filter(function (a) { return a.id !== id; });
    save(); render();
  }

  function render() {
    expire();
    var cur = $('ls').value;
    $('ls').innerHTML = S.alunos.map(function (a) { return '<option value="' + a.id + '">' + esc(a.nome) + '</option>'; }).join('');
    if (cur && aluno(cur)) $('ls').value = cur;

    $('alunos').innerHTML = S.alunos.map(function (a) {
      return '<div class="it"><div class="tx">' + esc(a.nome) + '<small>+' + a.tel + '</small></div>' +
        '<div class="btns"><button class="g x" data-act="delA" data-id="' + a.id + '">' + (armed === a.id ? 'Confirmar?' : 'Remover') + '</button></div></div>';
    }).join('') || '<div class="vazio">Nenhum aluno ainda.</div>';

    var p = due(), pd = pagDue();
    $('pendCard').hidden = !(p.length || pd.length);
    $('pend').innerHTML = p.map(function (a) {
      var al = aluno(a.aluno); if (!al) return '';
      var url = 'https://wa.me/' + al.tel + '?text=' + encodeURIComponent(msg(a));
      return '<div class="it col"><div class="tx"><b>' + esc(al.nome) + '</b> · aula às ' + a.hora + '<small>' + esc(msg(a)) + '</small></div>' +
        '<div class="btns"><a class="btn ok x" data-act="send" data-id="' + a.id + '" href="' + url + '" target="_blank" rel="noopener">Aprovar e enviar</a>' +
        '<button class="g x" data-act="skip" data-id="' + a.id + '">Pular</button></div></div>';
    }).join('') + pd.map(function (c) {
      return '<div class="it col"><div class="tx"><b>💰 ' + esc(c.al.nome) + '</b> · pagamento do pacote ' + c.n + '<small>' + esc(pmsg(c)) + '</small></div>' +
        '<div class="btns"><a class="btn ok x" data-act="cobrar" data-id="' + c.key + '" href="' + plink(c) + '" target="_blank" rel="noopener">Aprovar e cobrar</a>' +
        '<button class="g x" data-act="pago" data-id="' + c.key + '">Já pago</button>' +
        '<button class="g x" data-act="paySkip" data-id="' + c.key + '">Pular</button></div></div>';
    }).join('');

    if (filtro && !aluno(filtro)) filtro = '';
    $('fa').innerHTML = '<option value="">Todos os alunos</option>' + S.alunos.map(function (a) { return '<option value="' + a.id + '">' + esc(a.nome) + '</option>'; }).join('');
    $('fa').value = filtro;
    $('hist').checked = hist;
    $('antes').value = String(S.cfg.antes);
    $('fc').checked = !!S.cfg.faltaConta;
    if (document.activeElement !== $('pm')) $('pm').value = S.cfg.pm;
    var d = today();
    var l = S.aulas.filter(function (a) { return (!filtro || a.aluno === filtro) && (hist || a.data >= d || !a.res || a.res === 'chuva' || a.res === 'mudou'); })
      .sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); });
    $('aulas').innerHTML = l.map(function (a) {
      if (editing === a.id) return formEdit(a);
      var mk = a.status === 'agendada' && !a.res && novas(a) ? '<span class="tag m">' + (a.exp === undefined ? 'novo' : 'alterado') + '</span>' : '';
      var rem = a.rem ? ' · ' + (a.rem.motivo === 'chuva' ? '☔' : '📅') + ' remarcada de ' + fd(a.rem.de) : '';
      var rb = ['ok', 'chuva', 'mudou', 'faltou'].map(function (v) {
        return '<button class="g' + (a.res === v ? ' on' : '') + '" data-act="res" data-id="' + a.id + '" data-v="' + v + '" aria-label="' + RL[v] + '" aria-pressed="' + (a.res === v) + '" title="' + RL[v] + '">' + IC[v] + '</button>';
      }).join('');
      return '<div class="it"><div class="tx"><b>' + esc(nome(a)) + '</b> · ' + fd(a.data) + ' às ' + a.hora + (a.res ? ' ' + IC[a.res] : '') +
        '<small>' + esc(a.local || '') + ' · lembrete ' + a.lembrete + rem + '</small><div class="res">' + rb + '</div></div>' +
        '<div class="btns">' + mk + (a.res ? '' : '<span class="tag' + (a.status === 'enviada' ? ' s' : '') + '">' + a.status + '</span>') +
        '<button class="g x" data-act="edit" data-id="' + a.id + '" aria-label="Editar aula">✎</button>' +
        '<button class="g x" data-act="delL" data-id="' + a.id + '" aria-label="Excluir aula">✕</button></div></div>';
    }).join('') || '<div class="vazio">Nenhuma aula para mostrar.</div>';

    var cs = ciclos().filter(function (c) { return !filtro || c.al.id === filtro; })
      .sort(function (a, b) { return (a.data || '9999').localeCompare(b.data || '9999'); });
    $('pags').innerHTML = cs.map(function (c) {
      if (editPag === c.key) return formPag(c);
      var s = c.st;
      var est = s.pago ? ['✅ pago', 's'] : s.cobrado ? ['💬 cobrado', ''] : !c.comp ? [c.it.length + '/4 aulas', ''] : s.skip ? ['dispensado', ''] : c.data <= d ? ['⏰ vencido', 'm'] : ['pendente', ''];
      var aulas = c.it.map(function (a) { return fd(a.data).slice(0, 5) + (a.res ? ' ' + IC[a.res] : ''); }).join(', ');
      return '<div class="it"><div class="tx"><b>' + esc(c.al.nome) + '</b> · Pacote ' + c.n + ' <span class="tag ' + est[1] + '">' + est[0] + '</span>' +
        '<small>' + (c.comp ? 'Pagamento em ' + fd(c.data) : 'Pagamento definido na 4ª aula') + ' · aulas: ' + aulas + '</small></div>' +
        (c.comp ? '<div class="btns"><button class="g x" data-act="editP" data-id="' + c.key + '" aria-label="Editar data do pagamento">✎</button>' +
          (s.pago ? '' : '<a class="btn x" data-act="cobrar" data-id="' + c.key + '" href="' + plink(c) + '" target="_blank" rel="noopener" aria-label="Cobrar no WhatsApp">💬</a>') +
          '<button class="g x" data-act="pago" data-id="' + c.key + '">' + (s.pago ? 'Desfazer' : '💰 Pago') + '</button></div>' : '') + '</div>';
    }).join('') || '<div class="vazio">Os pacotes aparecem quando houver aulas marcadas.</div>';
    $('icsNew').textContent = '📅 Exportar só novas/alteradas (' + (listaFiltrada().filter(novas).length + cancelsFiltrados().length + pagCal(true).length) + ')';

    document.title = (p.length + pd.length ? '(' + (p.length + pd.length) + ') ' : '') + 'Agenda Skate';
    $('notif').hidden = !('Notification' in window) || Notification.permission !== 'default';
    lastSig = sig();
    p.forEach(function (a) { if (!notified[a.id]) { notified[a.id] = 1; notify(a); } });
    pd.forEach(function (c) { if (!notified[c.key]) { notified[c.key] = 1; notify({ aluno: c.al.id }); } });
  }
  function tick() { if (editing || editPag) return; expire(); if (sig() !== lastSig) render(); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    if (act === 'addA') addAluno();
    else if (act === 'addL') addAula();
    else if (act === 'icsNew') exportIcs(true);
    else if (act === 'icsAll') exportIcs(false);
    else if (act === 'edit') { editing = id; render(); }
    else if (act === 'cancE') { editing = null; render(); }
    else if (act === 'saveE') saveEdit(id);
    else if (act === 'res') setRes(id, v);
    else if (act === 'editP') { editPag = id; render(); }
    else if (act === 'cancP') { editPag = null; render(); }
    else if (act === 'saveP') savePag(id);
    else if (act === 'pago') { var s1 = stget(id); s1.pago = !s1.pago; save(); render(); }
    else if (act === 'paySkip') { stget(id).skip = true; save(); render(); }
    else if (act === 'cobrar') { stget(id).cobrado = true; save(); setTimeout(render, 600); }
    else if (act === 'delA') delAluno(id);
    else if (act === 'delL') { removeAulas(function (a) { return a.id === id; }); save(); render(); }
    else if (act === 'skip') { setStatus(id, 'dispensada'); render(); }
    else if (act === 'send') { setStatus(id, 'enviada'); setTimeout(render, 600); }
    else if (act === 'notif') {
      try { Notification.requestPermission().then(render); } catch (er) { render(); }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target; if (!t) return;
    if (t.id === 'fa') { filtro = t.value; render(); }
    else if (t.id === 'hist') { hist = t.checked; render(); }
    else if (t.id === 'antes') { S.cfg.antes = +t.value; S.aulas.forEach(function (a) { if (a.exp !== undefined) a.seq = (a.seq || 0) + 1; }); save(); render(); }
    else if (t.id === 'fc') { S.cfg.faltaConta = t.checked; save(); render(); }
    else if (t.id === 'pm') { S.cfg.pm = t.value; save(); }
  });
  $('ld').value = today();
  render();
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
})();
