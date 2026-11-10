(function () {
  'use strict';
  var S = { alunos: [], aulas: [] }, armed = null, lastSig = '', notified = {};
  try {
    var raw = localStorage.getItem('skate');
    if (raw) { var p = JSON.parse(raw); if (p && Array.isArray(p.alunos) && Array.isArray(p.aulas)) S = p; }
  } catch (e) {}

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
    return S.aulas.filter(function (a) { return a.status === 'agendada' && a.data === d && a.lembrete <= t; });
  }
  function sig() { return today() + '|' + due().map(function (a) { return a.id; }).join(','); }
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
  function exportIcs() {
    var d0 = today();
    var l = S.aulas.filter(function (a) { return a.status === 'agendada' && a.data >= d0 && aluno(a.aluno); });
    if (!l.length) { erro('Não há aulas futuras para exportar.'); return; }
    var stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Skate//PT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Aulas de Skate'];
    l.forEach(function (a) {
      var al = aluno(a.aluno), url = 'https://wa.me/' + al.tel + '?text=' + encodeURIComponent(msg(a));
      var diff = mins(a.hora) - mins(a.lembrete);
      L.push('BEGIN:VEVENT', 'UID:' + a.id + '@agenda-skate', 'DTSTAMP:' + stamp,
        'DTSTART:' + icsLocal(a.data, a.hora, 0), 'DTEND:' + icsLocal(a.data, a.hora, 60),
        'SUMMARY:' + icsText('Aula de skate - ' + al.nome),
        'LOCATION:' + icsText(a.local || ''),
        'DESCRIPTION:' + icsText('Toque no link para enviar o lembrete pelo WhatsApp:\n' + url + '\n\nMensagem: ' + msg(a)),
        'URL:' + url,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Enviar lembrete para ' + al.nome),
        'TRIGGER:' + (diff > 0 ? '-PT' + diff + 'M' : 'PT0S'), 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    var blob = new Blob([L.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var u = URL.createObjectURL(blob), lnk = document.createElement('a');
    lnk.href = u; lnk.download = 'aulas-skate.ics'; document.body.appendChild(lnk); lnk.click(); lnk.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
    erro('');
  }

  function setStatus(id, st) { var a = S.aulas.find(function (x) { return x.id === id; }); if (a) { a.status = st; save(); } }
  function delAluno(id) {
    if (armed !== id) {
      armed = id; render();
      setTimeout(function () { if (armed === id) { armed = null; render(); } }, 3000);
      return;
    }
    armed = null;
    S.alunos = S.alunos.filter(function (a) { return a.id !== id; });
    S.aulas = S.aulas.filter(function (a) { return a.aluno !== id; });
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

    var p = due();
    $('pendCard').hidden = !p.length;
    $('pend').innerHTML = p.map(function (a) {
      var al = aluno(a.aluno); if (!al) return '';
      var url = 'https://wa.me/' + al.tel + '?text=' + encodeURIComponent(msg(a));
      return '<div class="it col"><div class="tx"><b>' + esc(al.nome) + '</b> · aula às ' + a.hora + '<small>' + esc(msg(a)) + '</small></div>' +
        '<div class="btns"><a class="btn ok x" data-act="send" data-id="' + a.id + '" href="' + url + '" target="_blank" rel="noopener">Aprovar e enviar</a>' +
        '<button class="g x" data-act="skip" data-id="' + a.id + '">Pular</button></div></div>';
    }).join('');

    var d = today();
    var l = S.aulas.filter(function (a) { return a.data >= d; })
      .sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); });
    $('aulas').innerHTML = l.map(function (a) {
      return '<div class="it"><div class="tx"><b>' + esc(nome(a)) + '</b> · ' + fd(a.data) + ' às ' + a.hora +
        '<small>' + esc(a.local || '') + ' · lembrete ' + a.lembrete + '</small></div>' +
        '<div class="btns"><span class="tag' + (a.status === 'enviada' ? ' s' : '') + '">' + a.status + '</span>' +
        '<button class="g x" data-act="delL" data-id="' + a.id + '" aria-label="Excluir aula">✕</button></div></div>';
    }).join('') || '<div class="vazio">Nenhuma aula marcada.</div>';

    document.title = (p.length ? '(' + p.length + ') ' : '') + 'Agenda Skate';
    $('notif').hidden = !('Notification' in window) || Notification.permission !== 'default';
    lastSig = sig();
    p.forEach(function (a) { if (!notified[a.id]) { notified[a.id] = 1; notify(a); } });
  }
  function tick() { expire(); if (sig() !== lastSig) render(); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (act === 'addA') addAluno();
    else if (act === 'addL') addAula();
    else if (act === 'ics') exportIcs();
    else if (act === 'delA') delAluno(id);
    else if (act === 'delL') { S.aulas = S.aulas.filter(function (a) { return a.id !== id; }); save(); render(); }
    else if (act === 'skip') { setStatus(id, 'dispensada'); render(); }
    else if (act === 'send') { setStatus(id, 'enviada'); setTimeout(render, 600); }
    else if (act === 'notif') {
      try { Notification.requestPermission().then(render); } catch (er) { render(); }
    }
  });

  $('ld').value = today();
  render();
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
})();
