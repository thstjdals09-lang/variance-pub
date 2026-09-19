// pack-build — 생성 시트(assets/raw/sheets/<테마>_<종류>.png)를 잘라 assets/pack/<테마>/ 에 굽는다.
//
//   node tools/pack-build.mjs cozy            # 굽기 + manifest.json + 확인용 contact.png
//
// 규칙(CLAUDE.md "절대 다시 밟지 말 것" 참고):
//  - 기물 크기는 발자국 칸 수(=미터)로 정한다. 폭 = 가로칸 × 16px. 높이는 비율을 따르되 hmax로 캡.
//  - 사람은 시트의 "서 있는 첫 칸"에서 배율 하나를 구해 12칸 전부에 적용한다.
//  - 배경은 마젠타 키잉. 칸 배정은 성분 중심점이 속한 격자 칸(4×3)으로 — 성분이 붙거나 흩어져도 안정적.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./_canvas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = 16;

// 시트 정의. items 순서 = 읽는 순서(왼→오, 위→아래).
//   기물: [이름, 가로칸, 높이상한(px)]     사람: [이름] (시트 단위로 높이 기준 하나)
const SHEETS = {
  props: { cols: 4, rows: 3, kind: "prop", items: [
    ["table_basic", 2, 26], ["table_pro", 2, 26], ["table_vip", 3, 34], ["bar", 3, 44],
    ["plant", 1, 24], ["lamp", 1, 34], ["trophy", 2, 30], ["chair", 0.8, 16],
    ["door", 1, 28], ["dartboard", 1, 16], ["picture", 1, 14], ["shelf", 1.5, 36],
  ] },
  cast: { cols: 4, rows: 3, kind: "actor", standH: 26, items: [
    ["m_front_stand"], ["m_front_walk"], ["m_back_stand"], ["m_back_walk"],
    ["f_front_stand"], ["f_front_walk"], ["f_back_stand"], ["f_back_walk"],
    ["d_front_stand"], ["d_deal"], ["d_side_stand"], ["d_side_walk"],
  ] },
};

// ── 키잉 ────────────────────────────────────────────────
function hsv(data, o) {
  const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d < 0.12 || mx < 0.2) return null;
  let hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  return { hue, sat: d / mx, val: mx };
}
function keyMagenta(img) {
  const { width: w, height: h, data } = img;
  const grow = Math.max(4, Math.round(w / 200));
  // 테두리에서 그 시트의 배경 채도/명도 하한을 잰다 (시트마다 마젠타가 다르다)
  const rimS = [], rimV = [];
  const rim = (x, y) => { const c = hsv(data, (y * w + x) * 4); if (c && Math.abs(c.hue - 300) <= 25) { rimS.push(c.sat); rimV.push(c.val); } };
  for (let x = 0; x < w; x++) { rim(x, 0); rim(x, 1); rim(x, h - 1); rim(x, h - 2); }
  for (let y = 0; y < h; y++) { rim(0, y); rim(1, y); rim(w - 1, y); rim(w - 2, y); }
  rimS.sort((a, b) => a - b); rimV.sort((a, b) => a - b);
  const p5 = (a, d) => (a.length ? a[Math.floor(a.length * 0.05)] : d);
  const satMin = Math.min(0.85, Math.max(0.45, p5(rimS, 0.8) - 0.05));
  const valMin = Math.min(0.85, Math.max(0.45, p5(rimV, 0.9) - 0.08));
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4; const c = hsv(data, o);
    if (c && Math.abs(c.hue - 300) <= 22 && c.sat >= satMin && c.val >= valMin) data[o + 3] = 0;
  }
  // 경계 띠: 지워진 픽셀에 닿은 옅은 마젠타만 따라 들어간다 (보라 옷은 살아남는다)
  const loose = (o) => { const c = hsv(data, o); return c && Math.abs(c.hue - 300) <= 34 && c.sat >= 0.3 && c.val >= 0.3; };
  for (let pass = 0; pass < grow; pass++) {
    const hit = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (!data[o + 3] || !loose(o)) continue;
      if ((x > 0 && !data[o - 1]) || (x < w - 1 && !data[o + 7]) || (y > 0 && !data[o - w * 4 + 3]) || (y < h - 1 && !data[o + w * 4 + 3])) hit.push(o);
    }
    if (!hit.length) break;
    for (const o of hit) data[o + 3] = 0;
  }
  // 외곽 보라 기운 제거
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4; if (!data[o + 3]) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (r > 110 && b > 110 && g < Math.min(r, b) - 30) { const m = (r + b) / 2; data[o] = Math.round(r * 0.55 + m * 0.1); data[o + 2] = Math.round(b * 0.55 + m * 0.1); data[o + 1] = Math.round(g * 0.9); }
  }
  return img;
}

// 얇고 긴 한 색 줄(격자선) 제거
function stripGridLines(img) {
  const { width: w, height: h, data } = img;
  const on = (o) => data[o + 3] > 40;
  const maxThick = Math.max(3, Math.round(Math.min(w, h) * 0.012));
  const sweep = (n, len, at) => {
    const hit = [];
    for (let i = 0; i < n; i++) { let c = 0; for (let j = 0; j < len; j++) if (on(at(i, j))) c++; if (c > len * 0.9) hit.push(i); }
    for (let a = 0; a < hit.length;) { let b = a; while (b + 1 < hit.length && hit[b + 1] === hit[b] + 1) b++;
      if (b - a + 1 <= maxThick) for (let k = a; k <= b; k++) for (let j = 0; j < len; j++) data[at(hit[k], j) + 3] = 0; a = b + 1; }
  };
  sweep(h, w, (y, x) => (y * w + x) * 4); sweep(w, h, (x, y) => (y * w + x) * 4);
  return img;
}

// 연결 성분 → 격자 칸에 배정 → 칸마다 합집합
function cellBoxes(img, cols, rows) {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h); const stack = new Int32Array(w * h); const cells = new Array(cols * rows).fill(null);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || data[i * 4 + 3] < 40) continue;
    let sp = 0; stack[sp++] = i; seen[i] = 1; let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    while (sp) {
      const p = stack[--sp]; const px = p % w, py = (p / w) | 0; area++;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (px > 0) { const q = p - 1; if (!seen[q] && data[q * 4 + 3] >= 40) { seen[q] = 1; stack[sp++] = q; } }
      if (px < w - 1) { const q = p + 1; if (!seen[q] && data[q * 4 + 3] >= 40) { seen[q] = 1; stack[sp++] = q; } }
      if (py > 0) { const q = p - w; if (!seen[q] && data[q * 4 + 3] >= 40) { seen[q] = 1; stack[sp++] = q; } }
      if (py < h - 1) { const q = p + w; if (!seen[q] && data[q * 4 + 3] >= 40) { seen[q] = 1; stack[sp++] = q; } }
    }
    if (area < 60) continue;   // 티끌
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const c = Math.min(cols - 1, Math.floor(cx / w * cols)), r = Math.min(rows - 1, Math.floor(cy / h * rows)); const k = r * cols + c;
    cells[k] = cells[k] ? { x0: Math.min(cells[k].x0, x0), y0: Math.min(cells[k].y0, y0), x1: Math.max(cells[k].x1, x1), y1: Math.max(cells[k].y1, y1) } : { x0, y0, x1, y1 };
  }
  return cells;
}

// 박스 필터 축소 (알파 가중), 알파는 이진화 → 픽셀이 뭉개지지 않는다
function shrink(img, box, s) {
  const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1;
  const ow = Math.max(1, Math.round(sw * s)), oh = Math.max(1, Math.round(sh * s));
  const out = Buffer.alloc(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const xs = box.x0 + Math.floor(ox / s), xe = box.x0 + Math.max(Math.floor(ox / s) + 1, Math.floor((ox + 1) / s));
    const ys = box.y0 + Math.floor(oy / s), ye = box.y0 + Math.max(Math.floor(oy / s) + 1, Math.floor((oy + 1) / s));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = ys; y < ye && y <= box.y1; y++) for (let x = xs; x < xe && x <= box.x1; x++) {
      const o = (y * img.width + x) * 4; const al = img.data[o + 3] / 255; n++;
      if (al > 0.15) { r += img.data[o] * al; g += img.data[o + 1] * al; b += img.data[o + 2] * al; a += al; }
    }
    const q = (oy * ow + ox) * 4;
    if (n && a / n >= 0.45) { out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; out[q + 3] = 255; }
  }
  return { width: ow, height: oh, data: out };
}

// ── 메인 ────────────────────────────────────────────────
const theme = process.argv[2] || "cozy";
const outDir = join(ROOT, "assets/pack", theme); mkdirSync(outDir, { recursive: true });
const manifest = {};
const contact = [];   // 확인용 한 장에 모아 찍기

for (const [sheetName, spec] of Object.entries(SHEETS)) {
  const file = join(ROOT, "assets/raw/sheets", `${theme}_${sheetName}.png`);
  if (!existsSync(file)) { console.log(`(없음) ${file}`); continue; }
  const img = stripGridLines(keyMagenta(decodePng(readFileSync(file))));
  const cells = cellBoxes(img, spec.cols, spec.rows);
  const found = cells.filter(Boolean).length;
  console.log(`${sheetName}: ${img.width}×${img.height}, 칸 ${found}/${spec.items.length}`);
  // 사람: 첫 칸 높이에서 배율 하나
  let actorScale = 0;
  if (spec.kind === "actor") { const b = cells[0]; actorScale = spec.standH / (b.y1 - b.y0 + 1); }
  spec.items.forEach((it, i) => {
    const box = cells[i]; if (!box) { console.log(`  [${i}] ${it[0]} 비어 있음`); return; }
    let s;
    if (spec.kind === "actor") s = actorScale;
    else { s = (it[1] * T) / (box.x1 - box.x0 + 1); const hh = (box.y1 - box.y0 + 1) * s; if (hh > it[2]) s = it[2] / (box.y1 - box.y0 + 1); }
    const small = shrink(img, box, s);
    writeFileSync(join(outDir, it[0] + ".png"), encodePng(small.width, small.height, small.data));
    manifest[it[0]] = { w: small.width, h: small.height };
    contact.push({ name: it[0], img: small });
    console.log(`  ${it[0].padEnd(16)} ${small.width}×${small.height}`);
  });
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));

// contact.png: 4배 확대해 한 줄로 (tools/_out)
{
  const K = 4, gap = 6;
  const W = contact.reduce((a, c) => a + c.img.width * K + gap, gap), H = contact.reduce((a, c) => Math.max(a, c.img.height * K), 0) + gap * 2;
  const data = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { data[i * 4] = 60; data[i * 4 + 1] = 50; data[i * 4 + 2] = 70; data[i * 4 + 3] = 255; }
  let x = gap;
  for (const c of contact) {
    const y0 = H - gap - c.img.height * K;   // 발끝 정렬 → 크기 비교
    for (let y = 0; y < c.img.height * K; y++) for (let xx = 0; xx < c.img.width * K; xx++) {
      const o = (((y / K) | 0) * c.img.width + ((xx / K) | 0)) * 4; if (!c.img.data[o + 3]) continue;
      const q = ((y0 + y) * W + x + xx) * 4; data[q] = c.img.data[o]; data[q + 1] = c.img.data[o + 1]; data[q + 2] = c.img.data[o + 2]; data[q + 3] = 255;
    }
    x += c.img.width * K + gap;
  }
  mkdirSync(join(ROOT, "tools/_out"), { recursive: true });
  writeFileSync(join(ROOT, "tools/_out", `contact_${theme}.png`), encodePng(W, H, data));
  console.log(`contact → tools/_out/contact_${theme}.png`);
}
