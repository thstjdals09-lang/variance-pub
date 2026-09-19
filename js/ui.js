// HUD · 패널 · 배치 모드
const UI = (() => {
  const $ = s => document.querySelector(s);
  let tab = null, placing = null;   // placing: {key, moveId?}
  let toastTimer = 0;

  const fmt = n => n >= 1e8 ? (n / 1e8).toFixed(2) + '억' : n >= 1e4 ? (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '만' : Math.floor(n).toLocaleString();

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  function hud(st) {
    $('#hud-money').textContent = fmt(st.money);
    $('#hud-fame').textContent = fmt(st.fame);
    $('#hud-tier').textContent = `Lv.${st.tier + 1} ${DATA.TIERS[st.tier].name}`;
  }

  function open(name) {
    tab = name; document.querySelectorAll('#hud-bottom button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $('#panel').classList.remove('hidden'); render();
  }
  function close() { tab = null; $('#panel').classList.add('hidden'); document.querySelectorAll('#hud-bottom button').forEach(b => b.classList.remove('active')); Render.select(null); }

  function render() {
    if (!tab) return; const st = State.get(); const body = $('#panel-body');
    const titles = { shop: '🛒 상점', dealer: '🃏 딜러', deco: '🎨 꾸미기', event: '🏆 대회', table: '테이블' };
    $('#panel-title').textContent = titles[tab];
    body.innerHTML = '';
    if (tab === 'shop') renderShop(st, body);
    else if (tab === 'dealer') renderDealer(st, body);
    else if (tab === 'deco') renderDeco(st, body);
    else if (tab === 'event') renderEvent(st, body);
    else if (tab === 'table') renderTable(st, body);
  }

  function row(body, { thumb, title, sub, btn, onclick, disabled, extra }) {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `${thumb ? `<img class="thumb" src="${thumb}">` : ''}<div class="info"><b>${title}</b><small>${sub || ''}</small>${extra || ''}</div>`;
    if (btn) { const b = document.createElement('button'); b.textContent = btn; b.disabled = !!disabled; b.onclick = onclick; r.appendChild(b); }
    body.appendChild(r); return r;
  }

  function renderShop(st, body) {
    const tierMax = DATA.TIERS[st.tier].maxTables; const nT = State.tables().length;
    body.innerHTML = `<div class="hint">테이블 ${nT}/${tierMax} · 사면 바닥을 눌러 놓는다</div>`;
    for (const [key, d] of Object.entries(DATA.PROPS)) {
      if (d.unique && st.props.some(p => p.key === key)) continue;
      const full = d.cat === 'table' && nT >= tierMax;
      row(body, { thumb: Render.thumb(key), title: d.name, sub: d.cat === 'table' ? `좌석 ${d.seats} · 초당 ${d.rake}/명 · 명성 +${d.fameBonus}` : d.income ? `초당 +${d.income} · 명성 +${d.fameBonus}` : `명성 +${d.fameBonus}`,
        btn: full ? '티어 한도' : `💰 ${fmt(d.price)}`, disabled: full || st.money < d.price, onclick: () => startPlace(key) });
    }
  }

  function renderDealer(st, body) {
    const D = DATA.DEALER;
    row(body, { title: '딜러 고용', sub: `D등급으로 시작 · 테이블에 배정하면 수익 효율이 오른다`, btn: `💰 ${fmt(D.hireCost)}`, disabled: st.money < D.hireCost, onclick: () => {
      st.money -= D.hireCost; st.dealers.push({ id: State.nextId('d'), name: D.names[(Math.random() * D.names.length) | 0], grade: 'D', xp: 0 });
      // 빈 테이블에 자동 배정
      const t = State.tables().find(p => !p.dealerId); if (t) t.dealerId = st.dealers[st.dealers.length - 1].id;
      toast('딜러를 고용했다'); render(); State.save();
    } });
    for (const d of st.dealers) {
      const gi = State.dealerGradeIdx(d); const need = D.xpNeed[gi]; const t = State.tables().find(p => p.dealerId === d.id);
      const pct = need === Infinity ? 100 : Math.min(100, d.xp / need * 100);
      row(body, { title: `<span class="grade grade-${d.grade}">${d.grade}</span> ${d.name}`, sub: `효율 ×${D.eff[gi]} · ${t ? DATA.PROPS[t.key].name + ' 담당' : '대기 중'}`,
        extra: `<div class="bar"><i style="width:${pct}%"></i></div>`,
        btn: gi === D.grades.length - 1 ? '최고 등급' : `교육 💰${D.trainCost}`, disabled: st.money < D.trainCost || gi === D.grades.length - 1,
        onclick: () => { st.money -= D.trainCost; d.xp += D.trainXp; if (d.xp >= need) { d.xp -= need; d.grade = D.grades[gi + 1]; toast(`${d.name} → ${d.grade} 등급!`); } render(); State.save(); } });
    }
    if (!st.dealers.length) body.insertAdjacentHTML('beforeend', '<div class="hint">딜러가 없는 테이블은 효율 40%로 돈다. 첫 딜러를 고용하자.</div>');
  }

  function renderDeco(st, body) {
    if (st.tier < 1) { body.innerHTML = '<div class="hint">Lv.2 골목 명소부터 벽지·바닥을 바꿀 수 있다.<br>장식 기물은 상점에서 산다.</div>'; }
    for (const kind of ['floor', 'wall']) {
      const h = document.createElement('div'); h.className = 'hint'; h.textContent = kind === 'floor' ? '바닥' : '벽'; body.appendChild(h);
      const wrap = document.createElement('div'); wrap.className = 'swatches';
      for (const [key, s] of Object.entries(DATA.SKINS[kind])) {
        const owned = st.owned[kind].includes(key); const el = document.createElement('div'); el.className = 'swatch' + (st.skin[kind] === key ? ' sel' : '');
        el.style.background = kind === 'floor' ? `repeating-linear-gradient(45deg, ${s.a} 0 8px, ${s.b} 8px 16px)` : `linear-gradient(${s.top} 0 25%, ${s.face} 25%)`;
        el.innerHTML = `<span>${s.name}${owned ? '' : ' 💰' + fmt(s.price)}</span>`;
        el.onclick = () => {
          if (st.tier < 1) return toast('Lv.2부터 가능');
          if (!owned) { if (st.money < s.price) return toast('돈이 부족하다'); st.money -= s.price; st.owned[kind].push(key); }
          st.skin[kind] = key; State.save(); render();
        };
        wrap.appendChild(el);
      }
      body.appendChild(wrap); body.insertAdjacentHTML('beforeend', '<div style="height:18px"></div>');
    }
    body.insertAdjacentHTML('beforeend', '<div class="hint">놓인 기물을 누르면 옮기거나 팔 수 있다.</div>');
    const prog = Sim.tierProgress(st);
    if (prog) body.insertAdjacentHTML('beforeend', `<div class="hint"><b>다음: Lv.${st.tier + 2} ${prog.next.name}</b> (${prog.next.unlock} 해금)<br>` + prog.parts.map(p => `${p.label} ${fmt(p.cur)} / ${fmt(p.need)}`).join(' · ') + '</div>');
  }

  function renderEvent(st, body) {
    if (st.tier < 2) { body.innerHTML = `<div class="hint">Lv.3 지역 홀덤바부터 주간 토너먼트를 열 수 있다.<br>대회는 명성을 크게 올리고 상금 수익을 준다.</div>`; return; }
    const cost = 2000 * (st.tier); const cd = st.tourCd || 0; const left = Math.max(0, cd - Date.now());
    row(body, { title: '주간 토너먼트 개최', sub: `참가비 수익 + 명성 ↑ · 쿨다운 3분`, btn: left > 0 ? `${Math.ceil(left / 1000)}s` : `💰 ${fmt(cost)}`, disabled: left > 0 || st.money < cost, onclick: () => {
      st.money -= cost; const seats = State.tables().reduce((a, p) => a + DATA.PROPS[p.key].seats, 0);
      const prize = Math.round(cost * (1.2 + seats * 0.05)); const fame = Math.round(20 + seats * 3);
      st.money += prize; st.earned += prize; st.fame += fame; st.stats.tournaments++; st.tourCd = Date.now() + 180000;
      toast(`토너먼트 종료! +💰${fmt(prize)} +⭐${fame}`); render(); State.save();
    } });
    body.insertAdjacentHTML('beforeend', `<div class="hint">개최 횟수 ${st.stats.tournaments} · 방문 손님 ${st.stats.customers}</div>`);
  }

  let curTable = null;
  function renderTable(st, body) {
    const p = st.props.find(q => q.id === curTable); if (!p) return close(); const d = DATA.PROPS[p.key];
    $('#panel-title').textContent = d.name;
    if (d.cat === 'table') {
      const dl = st.dealers.find(x => x.id === p.dealerId); const free = st.dealers.filter(x => !State.tables().some(t => t.dealerId === x.id));
      row(body, { title: dl ? `딜러: <span class="grade grade-${dl.grade}">${dl.grade}</span> ${dl.name}` : '딜러 없음 (효율 40%)', sub: `좌석 ${d.seats} · 효율 ×${Sim.dealerEff(st, p)}`,
        btn: dl ? '배정 해제' : free.length ? '딜러 배정' : '대기 딜러 없음', disabled: !dl && !free.length,
        onclick: () => { if (dl) p.dealerId = null; else p.dealerId = free[0].id; State.save(); render(); } });
      const keys = Object.keys(DATA.PROPS).filter(k => DATA.PROPS[k].cat === 'table'); const ni = keys.indexOf(p.key) + 1;
      if (ni < keys.length) {
        const nk = keys[ni], nd = DATA.PROPS[nk]; const cost = Math.round(nd.price - d.price * 0.5);
        row(body, { thumb: Render.thumb(nk), title: `업그레이드 → ${nd.name}`, sub: `좌석 ${nd.seats} · 초당 ${nd.rake}/명`, btn: `💰 ${fmt(cost)}`, disabled: st.money < cost || !State.canPlace(nk, p.x, p.y, p.id),
          onclick: () => { if (!State.canPlace(nk, p.x, p.y, p.id)) return toast('자리가 좁다. 먼저 옮겨라'); st.money -= cost; Sim.evict(p.id); p.key = nk; State.save(); render(); toast('업그레이드 완료'); } });
      }
    }
    row(body, { title: '옮기기', sub: '바닥을 눌러 새 자리를 고른다', btn: '이동', onclick: () => { startPlace(p.key, p.id); } });
    row(body, { title: '판매', sub: `구매가의 50% 환불`, btn: `💰 +${fmt(d.price * 0.5)}`, onclick: () => { Sim.evict(p.id); st.money += d.price * 0.5; st.props = st.props.filter(q => q.id !== p.id); State.save(); close(); toast('판매했다'); } });
  }

  // ── 배치 모드 ──
  function startPlace(key, moveId) { placing = { key, moveId }; close(); toast(moveId ? '옮길 자리를 눌러라' : '놓을 자리를 눌러라 (다시 누르면 취소)'); }
  function tapTile(t) {
    const st = State.get(); const d = DATA.PROPS[placing.key];
    const x = t.x - Math.floor((d.size[0] - 1) / 2), y = t.y - Math.floor((d.size[1] - 1) / 2);
    if (!State.canPlace(placing.key, x, y, placing.moveId)) { toast('여기엔 놓을 수 없다'); return; }
    if (placing.moveId) { const p = st.props.find(q => q.id === placing.moveId); Sim.evict(p.id); p.x = x; p.y = y; }
    else { if (st.money < d.price) { placing = null; Render.setGhost(null); return toast('돈이 부족하다'); } st.money -= d.price; st.props.push({ id: State.nextId('p'), key: placing.key, x, y }); }
    placing = null; Render.setGhost(null); State.save(); toast('설치 완료');
  }
  function hoverTile(t) {
    if (!placing) return; const d = DATA.PROPS[placing.key];
    const x = t.x - Math.floor((d.size[0] - 1) / 2), y = t.y - Math.floor((d.size[1] - 1) / 2);
    Render.setGhost({ key: placing.key, x, y, ok: State.canPlace(placing.key, x, y, placing.moveId) });
  }

  // 화면 탭
  function tap(sx, sy) {
    const h = Render.hit(sx, sy);
    if (placing) { if (h.tile.x < 0 || h.tile.y < 0 || h.tile.x >= DATA.ROOM.w || h.tile.y >= DATA.ROOM.h) { placing = null; Render.setGhost(null); toast('취소'); } else tapTile(h.tile); return; }
    if (h.prop) { curTable = h.prop.id; Render.select(h.prop.id); open('table'); }
    else if (tab) close();
  }

  function init() {
    document.querySelectorAll('#hud-bottom button').forEach(b => b.onclick = () => { placing = null; Render.setGhost(null); tab === b.dataset.tab ? close() : open(b.dataset.tab); });
    $('#panel-close').onclick = close;
    Sim.on('tier', next => { toast(`🎉 Lv 업! ${next.name} — ${next.unlock} 해금`); render(); });
    Sim.on('notice', toast);
  }

  return { init, hud, tap, hoverTile, toast, render, isPlacing: () => !!placing };
})();
