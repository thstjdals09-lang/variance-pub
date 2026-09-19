// 노드에서 캔버스 코드를 그대로 돌려 보기 위한 최소 구현.
//
// 왜 필요한가: 도트 아트는 눈으로 봐야 검증된다. 브라우저를 띄워 스크린샷을 받는
// 왕복 대신, 게임이 쓰는 그리기 코드를 그대로 실행해 PNG로 떨어뜨린다.
// 지원하는 API는 fillStyle / fillRect / drawImage / imageSmoothingEnabled 뿐이고,
// 픽셀 아트 렌더러가 쓰는 게 딱 그만큼이다(곡선·그라디언트·안티에일리어싱 없음).

import { deflateSync, inflateSync } from "node:zlib";

// ---------------- PNG ----------------
function crcTable() {
  if (crcTable.t) return crcTable.t;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (crcTable.t = t);
}
function crc32(buf) {
  const t = crcTable();
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** RGBA8로 정규화해 돌려준다. 파이프라인이 내보내는 8비트 트루컬러/팔레트만 다룬다. */
export function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, depth = 8, color = 6;
  const idat = [];
  let plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      if (data[12] !== 0) throw new Error("인터레이스 PNG는 지원하지 않는다");
    } else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 && depth !== 16) throw new Error(`비트깊이 ${depth}는 지원하지 않는다`);
  // 16비트는 생성 모델이 이따금 뱉는다. 상위 바이트만 취해 8비트로 낮춘다 —
  // 도트 에셋은 채널당 256단계면 충분하고, 어차피 팔레트가 좁다.
  const bytes = depth === 16 ? 2 : 1;
  const ch = CHANNELS[color];
  const bpp = ch * bytes;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }
  const out = Buffer.alloc(width * height * 4);
  // 채널 k의 상위 바이트. 8비트면 그대로, 16비트면 두 바이트 중 앞쪽.
  const sample = (i, k) => lines[i * bpp + k * bytes];
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    if (color === 6) { out[o] = sample(i, 0); out[o + 1] = sample(i, 1); out[o + 2] = sample(i, 2); out[o + 3] = sample(i, 3); }
    else if (color === 2) { out[o] = sample(i, 0); out[o + 1] = sample(i, 1); out[o + 2] = sample(i, 2); out[o + 3] = 255; }
    else if (color === 0) { out[o] = out[o + 1] = out[o + 2] = sample(i, 0); out[o + 3] = 255; }
    else if (color === 4) { out[o] = out[o + 1] = out[o + 2] = sample(i, 0); out[o + 3] = sample(i, 1); }
    else {
      const idx = sample(i, 0);
      out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2];
      out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { width, height, data: out };
}

// ---------------- 색 ----------------
export function parseColor(c) {
  if (!c) return null;
  if (c[0] === "#") {
    const h = c.slice(1);
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
    if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    return [p[0] | 0, p[1] | 0, p[2] | 0, Math.round((p[3] == null ? 1 : p[3]) * 255)];
  }
  return [255, 0, 255, 255]; // 알 수 없는 색은 마젠타로 — 눈에 띄게
}

// ---------------- 캔버스 ----------------
export function makeCanvas(w, h) {
  const data = Buffer.alloc(w * h * 4);

  function px(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
    const o = (y * w + x) * 4;
    if (a >= 255) { data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; return; }
    const t = a / 255;
    data[o] = data[o] * (1 - t) + r * t;
    data[o + 1] = data[o + 1] * (1 - t) + g * t;
    data[o + 2] = data[o + 2] * (1 - t) + b * t;
    data[o + 3] = Math.min(255, data[o + 3] + a * (1 - data[o + 3] / 255));
  }

  const ctx = {
    fillStyle: "#000",
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    fillRect(x, y, rw, rh) {
      const col = parseColor(this.fillStyle);
      if (!col) return;
      const [r, g, b, a0] = col;
      const a = a0 * this.globalAlpha;
      x = Math.round(x); y = Math.round(y);
      rw = Math.round(rw); rh = Math.round(rh);
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) px(x + i, y + j, r, g, b, a);
    },
    clearRect(x, y, rw, rh) {
      x = Math.round(x); y = Math.round(y); rw = Math.round(rw); rh = Math.round(rh);
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const xx = x + i, yy = y + j;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        data.writeUInt32LE(0, (yy * w + xx) * 4);
      }
    },
    /**
     * drawImage(img, dx, dy[, dw, dh]) 와 drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) 둘 다.
     * 9인자 형태가 필요한 이유: 벽에 붙는 액자를 1px 세로 슬라이스로 잘라 기울여 얹는다.
     * 보간은 최근접 이웃만 — 픽셀 아트에 필요한 전부다.
     */
    drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
      if (!img || !img.width) return;
      let sx0 = 0, sy0 = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
      if (a5 === undefined) {
        dx = a1; dy = a2;
        dw = a3 == null ? img.width : a3;
        dh = a4 == null ? img.height : a4;
      } else {
        sx0 = a1; sy0 = a2; sw = a3; sh = a4;
        dx = a5; dy = a6;
        dw = a7 == null ? sw : a7;
        dh = a8 == null ? sh : a8;
      }
      dx = Math.round(dx); dy = Math.round(dy);
      dw = Math.round(dw); dh = Math.round(dh);
      for (let j = 0; j < dh; j++) {
        const sy = sy0 + Math.min(sh - 1, Math.floor((j * sh) / dh));
        if (sy < 0 || sy >= img.height) continue;
        for (let i = 0; i < dw; i++) {
          const sx = sx0 + Math.min(sw - 1, Math.floor((i * sw) / dw));
          if (sx < 0 || sx >= img.width) continue;
          const s = (sy * img.width + sx) * 4;
          px(dx + i, dy + j, img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3] * this.globalAlpha);
        }
      }
    },
    save() {}, restore() {}, translate() {}, scale() {},
  };

  return { ctx, data, width: w, height: h, getContext: () => ctx };
}

/** 정수 배율로 키우고 배경색과 합성해 PNG 버퍼로. */
export function toPng(surface, k = 1, bg = null) {
  const { width: w, height: h, data: src } = surface;
  const W = w * k, H = h * k;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (((y / k) | 0) * w + ((x / k) | 0)) * 4;
      const o = (y * W + x) * 4;
      if (bg) {
        const a = src[s + 3] / 255;
        out[o] = src[s] * a + bg[0] * (1 - a);
        out[o + 1] = src[s + 1] * a + bg[1] * (1 - a);
        out[o + 2] = src[s + 2] * a + bg[2] * (1 - a);
        out[o + 3] = 255;
      } else {
        out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
      }
    }
  }
  return encodePng(W, H, out);
}
