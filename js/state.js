// 게임 상태 한 덩어리 + 세이브/로드
const State = (() => {
  const KEY = 'variance.save.v1';

  function fresh() {
    return {
      money: 1200, fame: 0, earned: 0, tier: 0, seq: 1,
      props: [
        { id: 'p1', key: 'table_basic', x: 3, y: 4 },
      ],
      dealers: [],
      skin: { floor: 'wood', wall: 'cream' },
      owned: { floor: ['wood'], wall: ['cream'] },
      stats: { customers: 0, tournaments: 0 },
      lastSeen: Date.now(),
    };
  }

  let s = fresh();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { s = Object.assign(fresh(), JSON.parse(raw)); }
    } catch (e) { console.warn('load fail', e); }
    return s;
  }
  function save() {
    s.lastSeen = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function reset() { s = fresh(); save(); return s; }
  function nextId(prefix) { return prefix + (s.seq++); }

  // 기물 점유 지도 (배치·충돌·경로용). 1 = 막힘
  function occupancy() {
    const { w, h } = DATA.ROOM;
    const g = new Uint8Array(w * h);
    for (const p of s.props) {
      const d = DATA.PROPS[p.key];
      for (let dy = 0; dy < d.size[1]; dy++) for (let dx = 0; dx < d.size[0]; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = 1;
      }
    }
    return g;
  }
  function canPlace(key, x, y, ignoreId) {
    const d = DATA.PROPS[key]; const { w, h } = DATA.ROOM;
    if (x < 0 || y < 0 || x + d.size[0] > w || y + d.size[1] > h) return false;
    // 문 앞 통로(문 위 1칸)는 비워둔다
    if (y + d.size[1] > h - 1 && x <= DATA.DOOR_X && x + d.size[0] > DATA.DOOR_X) return false;
    const g = occupancy();
    if (ignoreId) { const p = s.props.find(q => q.id === ignoreId); if (p) {
      const pd = DATA.PROPS[p.key];
      for (let dy = 0; dy < pd.size[1]; dy++) for (let dx = 0; dx < pd.size[0]; dx++) g[(p.y + dy) * w + p.x + dx] = 0;
    } }
    for (let dy = 0; dy < d.size[1]; dy++) for (let dx = 0; dx < d.size[0]; dx++) if (g[(y + dy) * w + x + dx]) return false;
    return true;
  }
  function tables() { return s.props.filter(p => DATA.PROPS[p.key].cat === 'table'); }
  function tierInfo() { return DATA.TIERS[s.tier]; }
  function dealerGradeIdx(d) { return DATA.DEALER.grades.indexOf(d.grade); }

  return { get: () => s, load, save, reset, nextId, occupancy, canPlace, tables, tierInfo, dealerGradeIdx };
})();
