// 경제 틱. 렌더러와 분리. 손님(에이전트)은 세이브하지 않는다.
const Sim = (() => {
  const S = DATA.SIM;
  let customers = [];     // {id,x,y,path,state,tableId,seat,timer,look,color}
  let events = [];        // 떠오르는 글자 {x,y,text,t,color}
  let arrivalAcc = 0, cid = 1;
  const listeners = { tier: [], notice: [] };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const PALETTE = ['#e0553f', '#3f7fe0', '#48b06a', '#e0a83f', '#a05fd0', '#e07fb0', '#5fc9d0'];

  // 테이블 좌석 위치 (타일 좌표, 발 위치). 딜러는 위쪽 가운데.
  function seats(p) {
    const d = DATA.PROPS[p.key]; const w = d.size[0], h = d.size[1]; const out = [];
    for (let i = 0; i < w; i++) out.push({ tx: p.x + i, ty: p.y + h, fx: p.x + i + 0.5, fy: p.y + h + 0.45, dir: 'up' });     // 아래줄
    out.push({ tx: p.x - 1, ty: p.y, fx: p.x - 0.35, fy: p.y + 0.85, dir: 'right' });                                        // 왼쪽
    out.push({ tx: p.x + w, ty: p.y, fx: p.x + w + 0.35, fy: p.y + 0.85, dir: 'left' });                                     // 오른쪽
    for (let i = 0; i < w; i++) if (i !== Math.floor(w / 2)) out.push({ tx: p.x + i, ty: p.y - 1, fx: p.x + i + 0.5, fy: p.y - 0.1, dir: 'down' }); // 윗줄(딜러 자리 제외)
    return out.slice(0, d.seats);
  }
  function dealerSpot(p) { const d = DATA.PROPS[p.key]; const cx = p.x + Math.floor(d.size[0] / 2); return { tx: cx, ty: p.y - 1, fx: cx + 0.5, fy: p.y - 0.05 }; }

  function inRoom(x, y) { return x >= 0 && y >= 0 && x < DATA.ROOM.w && y < DATA.ROOM.h; }

  // BFS 경로. 막힌 칸(기물)은 피한다. 도착 칸이 막혀 있으면 null.
  function findPath(grid, sx, sy, tx, ty) {
    const w = DATA.ROOM.w, h = DATA.ROOM.h;
    if (!inRoom(tx, ty) || grid[ty * w + tx]) return null;
    const prev = new Int16Array(w * h).fill(-1); const seen = new Uint8Array(w * h);
    const start = sy * w + sx; const q = [start]; seen[start] = 1;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const c = q.shift(); const cx = c % w, cy = (c / w) | 0;
      if (cx === tx && cy === ty) {
        const path = []; let k = c;
        while (k !== start) { path.push({ x: k % w + 0.5, y: ((k / w) | 0) + 0.5 }); k = prev[k]; }
        return path.reverse();
      }
      for (let i = 0; i < 4; i++) {
        const nx = cx + DIRS[i][0], ny = cy + DIRS[i][1]; if (!inRoom(nx, ny)) continue;
        const n = ny * w + nx; if (seen[n] || grid[n]) continue; seen[n] = 1; prev[n] = c; q.push(n);
      }
    }
    return null;
  }

  function freeSeat(st) {
    const grid = State.occupancy(); const taken = new Set(customers.map(c => c.tableId + ':' + c.seat));
    const tables = State.tables().slice().sort(() => Math.random() - 0.5);
    for (const t of tables) {
      const ss = seats(t);
      for (let i = 0; i < ss.length; i++) {
        if (taken.has(t.id + ':' + i)) continue;
        if (!inRoom(ss[i].tx, ss[i].ty) || grid[ss[i].ty * DATA.ROOM.w + ss[i].tx]) continue;
        return { table: t, seat: i, pos: ss[i], grid };
      }
    }
    return null;
  }

  function dealerEff(st, table) {
    const d = st.dealers.find(x => x.id === table.dealerId);
    if (!d) return 0.4;
    return DATA.DEALER.eff[State.dealerGradeIdx(d)];
  }

  function spawn(st) {
    const f = freeSeat(st);
    if (!f) { st.fame = Math.max(0, st.fame - 0.5); return; }
    const door = { x: DATA.DOOR_X, y: DATA.ROOM.h - 1 };
    const path = findPath(f.grid, door.x, door.y, f.pos.tx, f.pos.ty);
    if (!path) return;
    path.push({ x: f.pos.fx, y: f.pos.fy });
    customers.push({
      id: cid++, x: door.x + 0.5, y: DATA.ROOM.h + 0.6, path, state: 'enter', tableId: f.table.id, seat: f.seat,
      look: f.pos.dir, timer: rnd(S.sitTime[0], S.sitTime[1]), color: PALETTE[(Math.random() * PALETTE.length) | 0],
      hair: Math.random() < 0.5 ? '#3a2418' : '#e8c070', frame: 0, char: Math.random() < 0.5 ? 'm' : 'f',
    });
    st.stats.customers++;
  }

  function moveAlong(c, dt) {
    let left = S.walkSpeed * dt;
    while (c.path.length && left > 0) {
      const t = c.path[0]; const dx = t.x - c.x, dy = t.y - c.y; const dist = Math.hypot(dx, dy);
      if (dist <= left) { c.x = t.x; c.y = t.y; c.path.shift(); left -= dist; }
      else {
        c.x += dx / dist * left; c.y += dy / dist * left; left = 0;
        c.look = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
    }
    c.frame += dt * 8;
    return c.path.length === 0;
  }

  function step(st, dt) {
    // 손님 유입
    const nT = State.tables().length;
    if (nT > 0) {
      arrivalAcc += dt * S.baseArrival * Math.pow(nT, 0.7) * (1 + st.fame / 1000);
      while (arrivalAcc >= 1) { arrivalAcc -= 1; spawn(st); }
    }
    // 손님 이동·수익
    for (const c of customers) {
      if (c.state === 'enter') {
        if (moveAlong(c, dt)) { c.state = 'sit'; c.look = seatLook(st, c); }
      } else if (c.state === 'sit') {
        c.timer -= dt;
        const t = st.props.find(p => p.id === c.tableId);
        if (!t) { c.state = 'leave'; c.path = leavePath(c); continue; }
        const d = DATA.PROPS[t.key]; const eff = dealerEff(st, t);
        const earn = d.rake * eff * dt;
        st.money += earn; st.earned += earn;
        const dl = st.dealers.find(x => x.id === t.dealerId); if (dl) gainXp(st, dl, dt * 0.08);
        if (c.timer <= 0) {
          const tip = Math.round(d.rake * eff * 3);
          st.money += tip; st.earned += tip; st.fame += 0.6 + d.fameBonus * 0.1 + (eff - 0.4);
          events.push({ x: c.x, y: c.y - 1.6, text: '+' + tip, t: 1.2, color: '#ffd86b' });
          c.state = 'leave'; c.path = leavePath(c);
        }
      } else if (c.state === 'leave') {
        if (moveAlong(c, dt)) c.state = 'gone';
      }
    }
    customers = customers.filter(c => c.state !== 'gone');
    // 바 카운터 수동 수익 (손님이 있어야 나온다)
    for (const p of st.props) {
      const d = DATA.PROPS[p.key];
      if (d.income) { const e = d.income * dt * Math.min(1, customers.length / 3); st.money += e; st.earned += e; }
    }
    for (const e of events) e.t -= dt; events = events.filter(e => e.t > 0);
    checkTier(st);
  }

  function seatLook(st, c) {
    const t = st.props.find(p => p.id === c.tableId); if (!t) return 'down';
    const s = seats(t)[c.seat]; return s ? s.dir : 'down';
  }
  function leavePath(c) {
    const grid = State.occupancy();
    const sx = Math.min(DATA.ROOM.w - 1, Math.max(0, c.x | 0)), sy = Math.min(DATA.ROOM.h - 1, Math.max(0, c.y | 0));
    grid[sy * DATA.ROOM.w + sx] = 0;
    const p = findPath(grid, sx, sy, DATA.DOOR_X, DATA.ROOM.h - 1) || [];
    p.push({ x: DATA.DOOR_X + 0.5, y: DATA.ROOM.h + 0.8 });
    return p;
  }

  function gainXp(st, d, xp) {
    const gi = State.dealerGradeIdx(d); const need = DATA.DEALER.xpNeed[gi];
    d.xp += xp;
    if (d.xp >= need && gi < DATA.DEALER.grades.length - 1) {
      d.xp -= need; d.grade = DATA.DEALER.grades[gi + 1];
      emit('notice', d.name + ' 딜러가 ' + d.grade + ' 등급으로 승급!');
    }
  }

  function condOk(st, c) {
    return (!c.earned || st.earned >= c.earned) && (!c.fame || st.fame >= c.fame)
      && (!c.dealers || st.dealers.length >= c.dealers)
      && (!c.gradeA || st.dealers.filter(d => State.dealerGradeIdx(d) >= 3).length >= c.gradeA);
  }
  function checkTier(st) {
    const next = DATA.TIERS[st.tier + 1]; if (!next) return;
    if (condOk(st, next.cond)) { st.tier++; emit('tier', next); }
  }
  function tierProgress(st) {
    const next = DATA.TIERS[st.tier + 1]; if (!next) return null; const c = next.cond; const parts = [];
    if (c.earned) parts.push({ label: '누적 수익', cur: Math.floor(st.earned), need: c.earned });
    if (c.fame) parts.push({ label: '명성', cur: Math.floor(st.fame), need: c.fame });
    if (c.dealers) parts.push({ label: '딜러 수', cur: st.dealers.length, need: c.dealers });
    if (c.gradeA) parts.push({ label: 'A등급 딜러', cur: st.dealers.filter(d => State.dealerGradeIdx(d) >= 3).length, need: c.gradeA });
    return { next, parts };
  }

  // 오프라인 수익: 좌석 절반이 찼다고 치고 계산
  function offline(st) {
    const sec = Math.min(S.offlineMaxSec, (Date.now() - (st.lastSeen || Date.now())) / 1000);
    if (sec < 30) return 0;
    let perSec = 0;
    for (const t of State.tables()) { const d = DATA.PROPS[t.key]; perSec += d.seats * 0.5 * d.rake * dealerEff(st, t) * 0.25; }
    const gain = Math.floor(perSec * sec * S.offlineRate);
    st.money += gain; st.earned += gain; return gain;
  }

  // 기물이 치워지면 그 자리 손님은 내보낸다
  function evict(tableId) {
    for (const c of customers) if (c.tableId === tableId && c.state !== 'leave') { c.state = 'leave'; c.path = leavePath(c); }
  }

  function on(ev, fn) { listeners[ev].push(fn); }
  function emit(ev, a) { for (const f of listeners[ev]) f(a); }

  return { step, offline, evict, seats, dealerSpot, dealerEff, tierProgress, on, customers: () => customers, events: () => events };
})();
