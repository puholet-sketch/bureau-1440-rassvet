/* Орбитальный театр: читаемый шар — РФ, КА «Рассвет», пятна, виток */
(() => {
  const canvas = document.getElementById("orbit-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("orbit-status");
  const coverEl = document.getElementById("orbit-cover-pct");
  const blindEl = document.getElementById("orbit-blind");
  const countEl = document.getElementById("orbit-count");
  const modeBtns = document.querySelectorAll("[data-orbit-mode]");

  const W = 900;
  const H = 560;
  const CX = 450;
  const CY = 286;
  const R = 196;

  const MODES = {
    now: { label: "Сейчас ~31", planes: 3, perPlane: 10, note: "Ранняя серия: короткие окна, много слепых зон на РФ" },
    target: { label: "Цель ~252", planes: 12, perPlane: 21, note: "12 плоскостей × 21 КА — заявка на бесшовность страны" },
  };

  let mode = "now";
  let simTime = 0;
  let lastFrame = 0;
  let playing = true;
  let sats = [];

  const VIEW_LON = (95 * Math.PI) / 180;

  function project(lat, lon) {
    const φ = (lat * Math.PI) / 180;
    const λ = (lon * Math.PI) / 180;
    const x0 = Math.cos(φ) * Math.sin(λ);
    const y0 = Math.sin(φ);
    const z0 = Math.cos(φ) * Math.cos(λ);
    const xv = x0 * Math.cos(VIEW_LON) + z0 * Math.sin(VIEW_LON);
    const yv = y0;
    const zv = -x0 * Math.sin(VIEW_LON) + z0 * Math.cos(VIEW_LON);
    return { x: CX + R * xv, y: CY - R * yv, z: zv, visible: zv > -0.02 };
  }

  const RU_OUTLINE = [
    [69, 30], [70, 42], [68, 55], [70, 68], [73, 82], [75, 100], [73, 125],
    [71, 150], [70, 170], [66, 180], [62, 175], [58, 165], [54, 148],
    [50, 140], [47, 138], [44, 135], [48, 90], [52, 58], [55, 40], [60, 32], [66, 30],
  ];

  const SAMPLE = [];
  for (let lat = 42; lat <= 72; lat += 4) {
    for (let lon = 30; lon <= 170; lon += 8) {
      if (lat < 48 && lon > 50 && lon < 130) continue;
      SAMPLE.push({ lat, lon });
    }
  }

  function buildSats(cfg) {
    const list = [];
    const iRad = (82.3 * Math.PI) / 180;
    for (let p = 0; p < cfg.planes; p++) {
      const raan = (p / cfg.planes) * Math.PI * 2;
      for (let k = 0; k < cfg.perPlane; k++) {
        const mean0 = (k / cfg.perPlane) * Math.PI * 2 + (p % 2) * (Math.PI / cfg.perPlane);
        list.push({ raan, mean0, iRad, plane: p });
      }
    }
    return list;
  }

  function satPos(s, time) {
    const u = s.mean0 + time * 0.78;
    const cosu = Math.cos(u);
    const sinu = Math.sin(u);
    const cosi = Math.cos(s.iRad);
    const sini = Math.sin(s.iRad);
    const cosO = Math.cos(s.raan);
    const sinO = Math.sin(s.raan);
    const x = cosO * cosu - sinO * sinu * cosi;
    const y = sinO * cosu + cosO * sinu * cosi;
    const z = sinu * sini;
    const xv = y * Math.cos(VIEW_LON) + x * Math.sin(VIEW_LON);
    const yv = z;
    const zv = -y * Math.sin(VIEW_LON) + x * Math.cos(VIEW_LON);
    const alt = R * 1.26;
    return {
      x: CX + alt * xv,
      y: CY - alt * yv,
      z: zv,
      lat: (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
      lon: (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360,
      front: zv > -0.12,
    };
  }

  const FOOT_ANGLE = 0.14;

  function coversPoint(sat, lat, lon) {
    const φ1 = (sat.lat * Math.PI) / 180;
    const λ1 = (sat.lon * Math.PI) / 180;
    const φ2 = (lat * Math.PI) / 180;
    const λ2 = (lon * Math.PI) / 180;
    const d =
      Math.sin(φ1) * Math.sin(φ2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ1 - λ2);
    return Math.acos(Math.min(1, Math.max(-1, d))) < FOOT_ANGLE * 3.2;
  }

  function setMode(id) {
    mode = id;
    sats = buildSats(MODES[mode]);
    modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.orbitMode === mode));
    if (statusEl) statusEl.textContent = MODES[mode].note;
  }

  modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.orbitMode)));

  const playBtn = document.getElementById("orbit-play");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "Пауза" : "Пуск";
    });
  }

  function drawChip(x, y, text, fill) {
    ctx.font = "600 11px Onest, sans-serif";
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = fill || "rgba(7,10,16,0.78)";
    ctx.strokeStyle = "rgba(243,241,239,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, 20, 2);
    else ctx.rect(x, y, w, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f3f1ef";
    ctx.fillText(text, x + 7, y + 14);
  }

  function drawLeader(fromX, fromY, toX, toY, label, fill) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = "rgba(243,241,239,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    drawChip(toX, toY - 10, label, fill);
  }

  function drawEarth() {
    const bg = ctx.createRadialGradient(CX, CY, R * 0.15, CX, CY, R * 2.4);
    bg.addColorStop(0, "#101826");
    bg.addColorStop(1, "#070a10");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.38)";
    for (let i = 0; i < 70; i++) {
      ctx.fillRect((i * 97) % W, (i * 53) % H, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }

    const eg = ctx.createRadialGradient(CX - 55, CY - 60, 16, CX, CY, R);
    eg.addColorStop(0, "#4a7d68");
    eg.addColorStop(0.45, "#1f3f34");
    eg.addColorStop(1, "#0a141c");
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let first = true;
      for (let lon = -90; lon <= 90; lon += 5) {
        const p = project(lat, lon);
        if (!p.visible) continue;
        if (first) {
          ctx.moveTo(p.x, p.y);
          first = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(92,225,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    let started = false;
    let sx = 0;
    let sy = 0;
    let n = 0;
    RU_OUTLINE.forEach(([lat, lon]) => {
      const p = project(lat, lon);
      if (!p.visible) return;
      sx += p.x;
      sy += p.y;
      n += 1;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(224, 32, 32, 0.38)";
    ctx.fill();
    ctx.strokeStyle = "#fb5a5a";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (n) {
      drawChip(sx / n - 28, sy / n - 8, "Россия", "rgba(160,16,16,0.88)");
    }

    const arctic = project(78, 90);
    if (arctic.visible) drawChip(arctic.x - 36, arctic.y - 8, "Арктика", "rgba(7,10,16,0.72)");
    drawChip(CX - 26, CY - 8, "экватор", "rgba(7,10,16,0.55)");
  }

  function drawFootprint(pos, labeled) {
    if (!pos.front) return;
    const lonCentered = ((pos.lon + 540) % 360) - 180;
    const pr = project(pos.lat, lonCentered);
    if (!pr.visible) return;
    const rad = 42;
    const grd = ctx.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, rad);
    grd.addColorStop(0, "rgba(255,176,32,0.42)");
    grd.addColorStop(1, "rgba(255,176,32,0)");
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    if (labeled) {
      drawLeader(pr.x, pr.y, pr.x + 54, pr.y + 36, "пятно связи одного КА", "rgba(80,50,8,0.88)");
    }
  }

  function drawSat(pos, linked, labeled) {
    if (!pos.front && pos.z < -0.35) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, linked ? 3.6 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = linked ? "#5ce1ff" : "#f3f1ef";
    ctx.fill();
    if (linked) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(92,225,255,0.55)";
      ctx.stroke();
    }
    if (labeled) {
      drawLeader(pos.x, pos.y, pos.x + 48, pos.y - 28, "КА «Рассвет»", "rgba(7,10,16,0.82)");
    }
  }

  function drawOrbitHints() {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(92,225,255,0.38)";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 6]);
    let first = true;
    let mid = null;
    for (let a = 0; a <= Math.PI * 2; a += 0.07) {
      const s = { raan: 0.35, mean0: a, iRad: (82.3 * Math.PI) / 180 };
      const p = satPos(s, 0);
      if (!p.front) {
        first = true;
        continue;
      }
      if (!mid || p.y < mid.y) mid = p;
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (mid) drawLeader(mid.x, mid.y, mid.x - 150, mid.y - 18, "виток орбиты i ≈ 82.3°", "rgba(8,28,36,0.88)");
  }

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    if (playing) simTime += (now - lastFrame) / 1000;
    lastFrame = now;

    canvas.width = W;
    canvas.height = H;
    drawEarth();
    drawOrbitHints();

    const positions = sats.map((s) => satPos(s, simTime));
    const showN = Math.min(positions.length, mode === "now" ? 31 : 80);

    for (let i = 0; i < showN; i++) drawFootprint(positions[i], false);

    const front = positions.map((p, i) => ({ p, i })).filter((o) => o.p.front);
    const labelSat = front.find((o) => o.p.x > CX && o.p.y < CY) || front[0];
    if (labelSat) drawFootprint(labelSat.p, true);

    ctx.strokeStyle = "rgba(92,225,255,0.28)";
    ctx.lineWidth = 1;
    const meshN = Math.min(front.length, mode === "now" ? 12 : 36);
    for (let i = 0; i < meshN; i++) {
      let best = -1;
      let bestD = 1e9;
      for (let j = i + 1; j < meshN; j++) {
        const dx = front[i].p.x - front[j].p.x;
        const dy = front[i].p.y - front[j].p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD && d < 130 * 130) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0) {
        ctx.beginPath();
        ctx.moveTo(front[i].p.x, front[i].p.y);
        ctx.lineTo(front[best].p.x, front[best].p.y);
        ctx.stroke();
      }
    }

    for (let i = 0; i < showN; i++) {
      const labeled = labelSat && positions[i] === labelSat.p;
      drawSat(positions[i], i % 7 === 0, labeled);
    }

    let covered = 0;
    SAMPLE.forEach((pt) => {
      if (positions.some((p) => coversPoint(p, pt.lat, pt.lon))) covered += 1;
    });
    const pct = Math.round((covered / SAMPLE.length) * 100);
    if (coverEl) coverEl.textContent = `${pct}%`;
    if (countEl) countEl.textContent = `${showN} из ${sats.length}`;
    if (blindEl) {
      blindEl.textContent =
        pct < 55
          ? "Слепые зоны большие: жёлтые пятна не закрывают всю красную РФ"
          : pct < 85
            ? "Слепые зоны редкие, но ещё есть"
            : "Слепые зоны минимальны (модель цели)";
    }

    requestAnimationFrame(frame);
  }

  setMode("now");
  requestAnimationFrame(frame);
})();
