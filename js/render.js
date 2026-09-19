// 픽셀 렌더러 (카이로소프트식 3/4 탑다운). 스프라이트는 아직 코드로 그린 임시본.
// 규칙: 모든 발 붙는 물건은 blit(key, footX, footY) 하나로. 그리기 순서는 발 y 정렬.
const Render = (() => {
  const T = DATA.TILE;
  let cv, ctx, W = 0, H = 0, scale = 2;
  let cam = { x: 0, y: 0 };
  const sprites = {};
  let ghost = null;   // {key,x,y,ok}
  let selected = null;

  // ── 임시 스프라이트 (1× 픽셀) ─────────────────────────────
  function mk(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn(g, w, h); return c; }
  const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  function tableSprite(w, h, felt, rim) {
    // 발자국 w×h 칸 → 그림 폭 w*T, 높이 h*T + 상판 두께
    return mk(w * T, h * T + 10, (g, W, H) => {
      const top = 4;
      px(g, 1, top + 2, W - 2, H - top - 4, '#2a1a10');            // 그림자/다리
      px(g, 2, top, W - 4, H - top - 6, rim);                       // 나무 테두리
      px(g, 0, top + 1, W, H - top - 8, rim);
      px(g, 4, top + 2, W - 8, H - top - 10, felt);                 // 펠트
      px(g, 6, top + 3, W - 12, 2, lighten(felt));                  // 하이라이트
      px(g, W / 2 - 3, top + H / 2 - 4, 6, 4, '#e8e0c8');           // 카드
      px(g, W / 2 - 8, top + H / 2 - 2, 3, 3, '#e0553f'); px(g, W / 2 + 5, top + H / 2 - 2, 3, 3, '#3f7fe0');
      px(g, 0, top + H - 10, W, 1, '#1a1008');
    });
  }
  function lighten(hex) { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, (n >> 16) + 40), g = Math.min(255, ((n >> 8) & 255) + 40), b = Math.min(255, (n & 255) + 40); return `rgb(${r},${g},${b})`; }

  function buildSprites() {
    sprites.table_basic = tableSprite(2, 1, '#2f7a42', '#6a4428');
    sprites.table_pro = tableSprite(2, 1, '#2f5a8a', '#3a2a20');
    sprites.table_vip = tableSprite(3, 2, '#7a2a3a', '#b08a3a');
    sprites.bar = mk(3 * T, T + 22, (g, W, H) => {
      px(g, 0, 0, W, 10, '#3a2418'); px(g, 2, 1, W - 4, 8, '#5a3a22');                  // 뒤 선반
      for (let i = 0; i < 6; i++) px(g, 4 + i * 7, 2, 3, 6, ['#48b06a', '#e0a83f', '#3f7fe0', '#e0553f', '#e8e0c8', '#a05fd0'][i]);
      px(g, 0, 12, W, H - 14, '#7a4e2a'); px(g, 0, 12, W, 4, '#a8743e'); px(g, 0, H - 4, W, 2, '#3a2418'); // 카운터
      px(g, 8, 18, 4, 5, '#e8e0c8'); px(g, 30, 18, 4, 5, '#e8e0c8');
    });
    sprites.plant = mk(T, 24, (g) => {
      px(g, 5, 16, 6, 7, '#a8543a'); px(g, 4, 15, 8, 2, '#c8744a');
      px(g, 2, 6, 12, 10, '#2f7a42'); px(g, 4, 2, 8, 6, '#48b06a'); px(g, 6, 0, 4, 4, '#6ad36a'); px(g, 1, 9, 3, 4, '#2f7a42'); px(g, 12, 8, 3, 4, '#2f7a42');
    });
    sprites.lamp = mk(T, 30, (g) => {
      px(g, 5, 26, 6, 3, '#3a2418'); px(g, 7, 10, 2, 17, '#5a4a3a');
      px(g, 2, 2, 12, 9, '#e8d090'); px(g, 3, 1, 10, 2, '#ffe8a0'); px(g, 1, 10, 14, 2, '#c8a860');
    });
    sprites.trophy = mk(2 * T, 28, (g, W) => {
      px(g, 0, 8, W, 20, '#3a2418'); px(g, 2, 10, W - 4, 16, '#5a3a22'); px(g, 3, 11, W - 6, 6, '#2a1a10');
      px(g, 6, 12, 4, 5, '#ffd86b'); px(g, 14, 11, 4, 6, '#ffd86b'); px(g, 22, 12, 4, 5, '#c8c8d0');
      px(g, 0, 6, W, 2, '#a8743e');
    });
  }

  // 사람: 12×24, 2등신. dir up/down/left/right, frame 0/1, sit
  const personCache = {};
  function person(color, hair, dir, frame, sit) {
    const key = [color, hair, dir, frame, sit].join('|'); if (personCache[key]) return personCache[key];
    const h = sit ? 20 : 24;
    const c = mk(12, h, (g) => {
      const legY = sit ? 16 : 18;
      if (!sit) { px(g, 3, legY, 3, 6 - (frame ? 1 : 0), '#2a2030'); px(g, 6, legY + (frame ? 1 : 0), 3, 6 - (frame ? 1 : 0), '#2a2030'); }
      else { px(g, 2, legY, 8, 3, '#2a2030'); }
      px(g, 2, 11, 8, 8, color);                        // 몸
      px(g, 2, 11, 1, 7, '#1a1220'); px(g, 9, 11, 1, 7, '#1a1220');
      if (dir !== 'up') { px(g, 1, 12, 1, 5, '#f0c8a0'); px(g, 10, 12, 1, 5, '#f0c8a0'); }
      px(g, 1, 1, 10, 10, hair);                         // 머리(머리카락)
      if (dir !== 'up') {
        px(g, 2, 4, 8, 7, '#f6d2b0');                    // 얼굴
        if (dir === 'down') { px(g, 3, 6, 2, 2, '#1a1220'); px(g, 7, 6, 2, 2, '#1a1220'); }
        else if (dir === 'left') { px(g, 3, 6, 2, 2, '#1a1220'); px(g, 1, 4, 3, 7, hair); }
        else { px(g, 7, 6, 2, 2, '#1a1220'); px(g, 8, 4, 3, 7, hair); }
        px(g, 2, 3, 8, 2, hair);
      }
      px(g, 1, 0, 10, 1, '#1a1220'); px(g, 0, 1, 1, 10, '#1a1220'); px(g, 11, 1, 1, 10, '#1a1220'); // 외곽선
    });
    personCache[key] = c; return c;
  }

  // ── 에셋 팩 (assets/pack/<테마>/*.png). 로드되면 코드 스프라이트를 덮어쓴다 ──
  const pack = {};   // name → Image
  const flipCache = {};
  const ACTOR_NAMES = ['m_front_stand', 'm_front_walk', 'm_back_stand', 'm_back_walk', 'f_front_stand', 'f_front_walk', 'f_back_stand', 'f_back_walk', 'd_front_stand', 'd_deal', 'd_side_stand', 'd_side_walk'];
  const EXTRA_NAMES = ['chair', 'door', 'dartboard', 'picture'];
  function loadPack(theme) {
    const names = Object.keys(DATA.PROPS).concat(ACTOR_NAMES, EXTRA_NAMES);
    for (const n of names) {
      const im = new Image(); im.onload = () => { pack[n] = im; if (DATA.PROPS[n]) sprites[n] = im; };
      im.src = `assets/pack/${theme}/${n}.png`;
    }
  }
  // 좌우반전 사본 (side 뷰를 오른쪽으로 쓸 때)
  function flipped(name) {
    if (flipCache[name]) return flipCache[name]; const im = pack[name]; if (!im) return null;
    const c = mk(im.width, im.height, g => { g.translate(im.width, 0); g.scale(-1, 1); g.drawImage(im, 0, 0); });
    flipCache[name] = c; return c;
  }

  // ── 캔버스/카메라 ────────────────────────────────────────
  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d'); buildSprites(); loadPack('cozy'); resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W; cv.height = H;
    scale = W < 560 ? 2 : 3;
    ctx.imageSmoothingEnabled = false;
    centerCam();
  }
  function roomPx() { return { w: (DATA.ROOM.w + 2) * T, h: (DATA.ROOM.h + DATA.WALL_H + 2) * T }; }
  function centerCam() { const r = roomPx(); cam.x = (r.w * scale - W) / 2; cam.y = (r.h * scale - H) / 2 + 24; clampCam(); }
  function clampCam() {
    const r = roomPx(); const m = 40;
    cam.x = Math.max(-m, Math.min(r.w * scale - W + m, cam.x));
    cam.y = Math.max(-m - 40, Math.min(r.h * scale - H + m + 60, cam.y));
  }
  function pan(dx, dy) { cam.x -= dx; cam.y -= dy; clampCam(); }

  // 월드(px, 1×) ↔ 타일. 방 원점: 왼쪽 벽 1칸, 위쪽 벽 WALL_H+1칸
  const OX = T, OY = (DATA.WALL_H + 1) * T;
  function tileToWorld(tx, ty) { return { x: OX + tx * T, y: OY + ty * T }; }
  function screenToTile(sx, sy) { const wx = (sx + cam.x) / scale, wy = (sy + cam.y) / scale; return { x: Math.floor((wx - OX) / T), y: Math.floor((wy - OY) / T), wx, wy }; }

  function hit(sx, sy) {
    const t = screenToTile(sx, sy); const st = State.get();
    // 위에 그려진(발 y 큰) 것부터
    const props = st.props.slice().sort((a, b) => (b.y + DATA.PROPS[b.key].size[1]) - (a.y + DATA.PROPS[a.key].size[1]));
    for (const p of props) {
      const d = DATA.PROPS[p.key];
      if (t.x >= p.x && t.x < p.x + d.size[0] && t.y >= p.y - 1 && t.y < p.y + d.size[1]) return { prop: p, tile: t };
    }
    return { tile: t };
  }

  // ── 그리기 ───────────────────────────────────────────────
  function draw(st, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2d5a36'; ctx.fillRect(0, 0, W, H);     // 바깥 잔디
    ctx.setTransform(scale, 0, 0, scale, -Math.round(cam.x), -Math.round(cam.y));
    ctx.imageSmoothingEnabled = false;
    drawRoom(st);
    const list = [];
    for (const p of st.props) list.push({ y: p.y + DATA.PROPS[p.key].size[1], f: () => drawProp(p, st) });
    // 좌석 의자: 사람보다 먼저(같은 y에서 -0.01) 그린다 — 등받이가 사람을 가리지 않게
    if (pack.chair) for (const p of State.tables()) for (const s of Sim.seats(p)) list.push({ y: s.fy - 0.01, f: () => drawAt(pack.chair, s.fx, s.fy + 0.1) });
    for (const c of Sim.customers()) list.push({ y: c.y, f: () => drawPerson(c, c.state === 'sit' ? 0 : ((c.frame | 0) & 1), c.state === 'sit') });
    for (const p of State.tables()) if (p.dealerId) { const s = Sim.dealerSpot(p); list.push({ y: s.fy, f: () => drawDealer(s.fx, s.fy, ((time / 700) | 0) & 1) }); }
    if (ghost) list.push({ y: ghost.y + DATA.PROPS[ghost.key].size[1], f: () => drawGhost() });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.f();
    for (const e of Sim.events()) {
      const w = tileToWorld(e.x, e.y - (1.2 - e.t) * 0.8);
      ctx.font = '8px monospace'; ctx.fillStyle = '#000'; ctx.fillText(e.text, w.x + 1, w.y + 1); ctx.fillStyle = e.color; ctx.fillText(e.text, w.x, w.y);
    }
    if (selected) { const p = st.props.find(q => q.id === selected); if (p) { const d = DATA.PROPS[p.key]; const w = tileToWorld(p.x, p.y); ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 1; ctx.strokeRect(w.x + 0.5, w.y + 0.5, d.size[0] * T - 1, d.size[1] * T - 1); } }
    // 간판
    drawSign();
  }

  function drawRoom(st) {
    const F = DATA.SKINS.floor[st.skin.floor], Wl = DATA.SKINS.wall[st.skin.wall];
    const rw = DATA.ROOM.w, rh = DATA.ROOM.h, WH = DATA.WALL_H;
    // 외벽 윗면(지붕 선) + 뒷벽 앞면
    ctx.fillStyle = Wl.top; ctx.fillRect(0, 0, (rw + 2) * T, T);
    ctx.fillStyle = Wl.face; ctx.fillRect(0, T, (rw + 2) * T, WH * T);
    ctx.fillStyle = Wl.trim; ctx.fillRect(0, (WH + 1) * T - 3, (rw + 2) * T, 3);
    // 뒷벽 장식: 창문 2개
    for (const wx of [3, rw - 4]) { ctx.fillStyle = '#8ad6ff'; ctx.fillRect(OX + wx * T + 2, T + 6, 2 * T - 4, T + 4); ctx.fillStyle = Wl.trim; ctx.fillRect(OX + wx * T + T - 1, T + 6, 2, T + 4); ctx.fillRect(OX + wx * T + 2, T + 6 + (T + 4) / 2, 2 * T - 4, 2); }
    // 바닥
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const w = tileToWorld(x, y); ctx.fillStyle = ((x + y) & 1) ? F.a : F.b; ctx.fillRect(w.x, w.y, T, T);
      ctx.fillStyle = F.line; ctx.fillRect(w.x, w.y + T - 1, T, 1);
    }
    // 좌우 벽, 아래 벽(문 구멍)
    ctx.fillStyle = Wl.top; ctx.fillRect(0, T, T, (WH + rh + 1) * T); ctx.fillRect((rw + 1) * T, T, T, (WH + rh + 1) * T);
    ctx.fillStyle = Wl.top; ctx.fillRect(0, OY + rh * T, (rw + 2) * T, T);
    ctx.fillStyle = Wl.face; ctx.fillRect(0, OY + rh * T + 4, (rw + 2) * T, T - 4);
    const dw = tileToWorld(DATA.DOOR_X, rh);
    // 발판 매트
    ctx.fillStyle = '#8a2a34'; ctx.fillRect(dw.x - 2, dw.y - T, T + 4, T - 2);
    if (pack.door) ctx.drawImage(pack.door, dw.x, dw.y + T - pack.door.height - 2);
    else { ctx.fillStyle = '#3a2418'; ctx.fillRect(dw.x - 2, dw.y - 2, T + 4, T + 2); ctx.fillStyle = '#a8743e'; ctx.fillRect(dw.x, dw.y - 1, T, T + 1); ctx.fillStyle = '#ffd86b'; ctx.fillRect(dw.x + T - 4, dw.y + 6, 2, 2); }
    // 뒷벽 장식 (다트판·액자) — 기본 제공
    if (pack.dartboard) ctx.drawImage(pack.dartboard, OX + 7 * T, T + 6);
    if (pack.picture) ctx.drawImage(pack.picture, OX + 10 * T, T + 8);
  }
  function drawSign() {
    const x = OX + (DATA.ROOM.w / 2 - 2) * T, y = -6;
    ctx.fillStyle = '#3a2418'; ctx.fillRect(x, y, 4 * T, 14); ctx.fillStyle = '#ffd86b'; ctx.fillRect(x + 1, y + 1, 4 * T - 2, 12);
    ctx.fillStyle = '#3a2418'; ctx.font = 'bold 8px monospace'; ctx.fillText('VARIANCE', x + 8, y + 10);
  }
  function drawProp(p, st) {
    const sp = sprites[p.key]; if (!sp) return; const d = DATA.PROPS[p.key];
    const w = tileToWorld(p.x, p.y + d.size[1]);
    ctx.drawImage(sp, w.x, w.y - sp.height);
    if (d.cat === 'table' && !p.dealerId && st.dealers.length >= 0) {
      // 딜러 없음 표시
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(w.x + d.size[0] * T / 2 - 4, w.y - sp.height - 8, 8, 8);
      ctx.fillStyle = '#ffd86b'; ctx.font = '7px monospace'; ctx.fillText('!', w.x + d.size[0] * T / 2 - 2, w.y - sp.height - 1);
    }
  }
  // 발 위치(fx,fy)에 그림 바닥 중앙을 맞춰 찍는다. cut = 아래에서 잘라낼 px(앉은 모습: 다리를 테이블 뒤로)
  function drawAt(im, fx, fy, cut = 0) {
    const w = tileToWorld(fx, fy); const h = im.height - cut;
    ctx.drawImage(im, 0, 0, im.width, h, Math.round(w.x - im.width / 2), Math.round(w.y - h), im.width, h);
  }
  function drawPerson(c, frame, sit) {
    const w = tileToWorld(c.x, c.y);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(w.x - 5, w.y - 2, 10, 3);
    const face = c.look === 'up' ? 'back' : 'front';
    const name = `${c.char || 'm'}_${face}_${frame && !sit ? 'walk' : 'stand'}`;
    if (pack[name]) {
      // 옆으로 걸을 때는 앞모습을 진행 방향으로 반전 (측면 시트는 다음 단계)
      const im = c.look === 'left' ? flipped(name) : pack[name];
      drawAt(im, c.x, c.y, sit ? 5 : 0); return;
    }
    const sp = person(c.color, c.hair, c.look, frame, sit);
    ctx.drawImage(sp, Math.round(w.x - 6), Math.round(w.y - sp.height));
  }
  function drawDealer(fx, fy, phase) {
    const name = phase ? 'd_deal' : 'd_front_stand';
    if (pack[name]) { const w = tileToWorld(fx, fy); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(w.x - 5, w.y - 2, 10, 3); drawAt(pack[name], fx, fy); return; }
    const sp = person('#1a1a22', '#2a2418', 'down', phase, false); const w = tileToWorld(fx, fy);
    ctx.drawImage(sp, Math.round(w.x - 6), Math.round(w.y - sp.height));
    ctx.fillStyle = '#e0553f'; ctx.fillRect(Math.round(w.x - 2), Math.round(w.y - 12), 4, 2);
  }
  function drawGhost() {
    const d = DATA.PROPS[ghost.key]; const sp = sprites[ghost.key]; const w = tileToWorld(ghost.x, ghost.y);
    ctx.fillStyle = ghost.ok ? 'rgba(106,211,106,.45)' : 'rgba(224,85,63,.5)';
    ctx.fillRect(w.x, w.y, d.size[0] * T, d.size[1] * T);
    if (sp) { ctx.globalAlpha = .7; ctx.drawImage(sp, w.x, w.y + d.size[1] * T - sp.height); ctx.globalAlpha = 1; }
  }

  // 상점 썸네일
  function thumb(key) { return sprites[key] ? sprites[key].toDataURL() : ''; }

  return { init, draw, pan, hit, thumb, setGhost: g => { ghost = g; }, select: id => { selected = id; }, centerCam };
})();
