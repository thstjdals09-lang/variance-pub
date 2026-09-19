// 부팅 + 루프
(() => {
  const cv = document.getElementById('game');
  const st = State.load();
  Render.init(cv); UI.init();

  const gain = Sim.offline(st);
  if (gain > 0) UI.toast(`자리를 비운 동안 💰${Math.floor(gain).toLocaleString()} 벌었다`);

  // 포인터: 10px 미만이면 탭, 그 이상은 카메라 드래그
  let down = null, moved = false;
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; moved = false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (moved || Math.hypot(dx, dy) > 10) { moved = true; Render.pan(dx, dy); down = { x: e.clientX, y: e.clientY }; }
    }
    if (UI.isPlacing()) UI.hoverTile(Render.hit(e.clientX, e.clientY).tile);
  });
  cv.addEventListener('pointerup', e => { if (down && !moved) UI.tap(e.clientX, e.clientY); down = null; });
  cv.addEventListener('pointercancel', () => { down = null; });

  let last = performance.now(), acc = 0, saveAcc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt;
    while (acc >= 1 / 30) { Sim.step(st, 1 / 30); acc -= 1 / 30; }
    saveAcc += dt; if (saveAcc > 10) { saveAcc = 0; State.save(); }
    Render.draw(st, now); UI.hud(st);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.addEventListener('beforeunload', State.save);
  window.__dbg = { st, State, Sim, Render, UI };
})();
