// 수치표. 순수 데이터만. 로직 없음.
const DATA = {
  TILE: 16,
  ROOM: { w: 16, h: 11 },          // 바닥 타일 수 (벽 제외)
  WALL_H: 2,                       // 위쪽 벽면 높이(타일)
  DOOR_X: 7,                       // 아래 벽 문 위치(타일)

  TIERS: [
    { name: '동네 펍',     maxTables: 2,  cond: { earned: 5000 },          unlock: '딜러 고용' },
    { name: '골목 명소',   maxTables: 4,  cond: { fame: 100, dealers: 2 }, unlock: '꾸미기: 벽지·바닥' },
    { name: '지역 홀덤바', maxTables: 6,  cond: { fame: 600 },             unlock: '주간 토너먼트' },
    { name: '도시 대표',   maxTables: 8,  cond: { fame: 2000, gradeA: 1 }, unlock: '테마 스킨' },
    { name: '전국 대회장', maxTables: 12, cond: { fame: 5000 },            unlock: '확장 공간' },
    { name: '아시아 투어', maxTables: 16, cond: { fame: 10000 },           unlock: 'VIP룸' },
    { name: '세계대회',    maxTables: 24, cond: { fame: 30000 },           unlock: '엔딩' },
  ],

  // size: [가로칸, 세로칸]. 크기는 칸(=1m) 단위로만 적는다.
  PROPS: {
    table_basic: { name: '기본 테이블', cat: 'table', size: [2, 1], price: 600,  rake: 4,  seats: 4, fameBonus: 0 },
    table_pro:   { name: '프로 테이블', cat: 'table', size: [2, 1], price: 2400, rake: 9,  seats: 6, fameBonus: 2 },
    table_vip:   { name: 'VIP 테이블',  cat: 'table', size: [3, 2], price: 9000, rake: 22, seats: 8, fameBonus: 6 },
    bar:         { name: '바 카운터',   cat: 'util',  size: [3, 1], price: 1500, income: 3, fameBonus: 3, unique: true },
    plant:       { name: '화분',        cat: 'deco',  size: [1, 1], price: 120,  fameBonus: 1 },
    lamp:        { name: '스탠드 조명', cat: 'deco',  size: [1, 1], price: 260,  fameBonus: 2 },
    trophy:      { name: '트로피 장식장', cat: 'deco', size: [2, 1], price: 1800, fameBonus: 8 },
  },

  DEALER: {
    hireCost: 800,
    trainCost: 150,
    trainXp: 25,
    grades: ['D', 'C', 'B', 'A', 'S'],
    eff:    [0.6, 0.8, 1.0, 1.25, 1.5],
    xpNeed: [100, 250, 600, 1500, Infinity],
    names: ['민준', '서연', '도윤', '하은', '지호', '수아', '예준', '지우', '현우', '나은', '시우', '유나'],
  },

  SKINS: {
    floor: {
      wood:   { name: '나무 마루', a: '#8a5a3a', b: '#7a4e32', line: '#5e3a24', price: 0 },
      tile:   { name: '체크 타일', a: '#b8b0a0', b: '#9a9284', line: '#6e6860', price: 400 },
      carpet: { name: '붉은 카펫', a: '#8a2a34', b: '#7c2530', line: '#5a1a22', price: 900 },
      green:  { name: '녹색 펠트', a: '#2f6a3e', b: '#2a5e37', line: '#1d4227', price: 1400 },
    },
    wall: {
      cream:  { name: '크림 벽지', face: '#d9c9a8', top: '#8a7a62', trim: '#5e4a34', price: 0 },
      brick:  { name: '붉은 벽돌', face: '#9a4a3a', top: '#5a2a22', trim: '#3a1a12', price: 500 },
      navy:   { name: '네이비',    face: '#2c3a5c', top: '#18203a', trim: '#0e1424', price: 1100 },
      black:  { name: '블랙 라운지', face: '#2a242e', top: '#14101a', trim: '#0a080c', price: 2000 },
    },
  },

  SIM: {
    tick: 1.0,                 // 초
    baseArrival: 0.35,         // 초당 손님 도착 기대값 (테이블 1개 기준)
    sitTime: [18, 40],         // 앉아 있는 시간 범위(초)
    walkSpeed: 2.6,            // 타일/초
    offlineMaxSec: 8 * 3600,
    offlineRate: 0.5,
  },
};
