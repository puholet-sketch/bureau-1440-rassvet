/* Орбитальный театр: Земля, КА, пятна покрытия, слепые зоны РФ */
(() => {
  const canvas = document.getElementById("orbit-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("orbit-status");
  const coverEl = document.getElementById("orbit-cover-pct");
  const blindEl = document.getElementById("orbit-blind");
  const modeBtns = document.querySelectorAll("[data-orbit-mode]");

  const W = 900;
  const H = 520;
  const CX = 340;
  const CY = 270;
  const R = 168;

  // Приполярная орбита i≈82.3°: ITU-цель 12 плоскостей × 21 КА ≈ 252
  const MODES = {
    now: { label: "Сейчас ~31", planes: 3, perPlane: 10, note: "Ранняя серия: короткие окна, много слепых зон" },
    target: { label: "Цель ~252", planes: 12, perPlane: 21, note: "12 плоскостей × 21 КА — заявка на бесшовность РФ" },
  };

  let mode = "now";
  let simTime = 0;
  let lastFrame = 0;
  let playing = true;
  let sats = [];

  const VIEW_LON = (95 * Math.PI) / 180;

  // Ortho: Россия «лицом» к камере (центр ~95° в.д.)
  function project(lat, lon) {
    const φ = (lat * Math.PI) / 180;
    const λ = (lon * Math.PI) / 180;
    const x0 = Math.cos(φ) * Math.sin(λ);
    const y0 = Math.sin(φ);
    const z0 = Math.cos(φ) * Math.cos(λ);
    const xv = x0 * Math.cos(VIEW_LON) + z0 * Math.sin(VIEW_LON);
    const yv = y0;
    const zv = -x0 * Math.sin(VIEW_LON) + z0 * Math.cos(VIEW_LON);
    return {
      x: CX + R * xv,
      y: CY - R * yv,
      z: zv,
      visible: zv > -0.02,
    };
  }

  const RU_OUTLINE = [
    [70, 30], [69, 60], [72, 80], [75, 100], [72, 140], [70, 170],
    [65, 180], [60, 170], [55, 160], [50, 140], [48, 130], [45, 140],
    [42, 130], [45, 50], [50, 40], [55, 35], [60, 30], [65, 30], [70, 30],
  ];

  // Сетка точек по РФ для оценки покрытия
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
    // Ускоренное время: полный виток ~8 с экранного времени
    const mean = s.mean0 + time * 0.78;
    const u = mean;
    const cosu = Math.cos(u);
    const sinu = Math.sin(u);
    const cosi = Math.cos(s.iRad);
    const sini = Math.sin(s.iRad);
    const cosO = Math.cos(s.raan);
    const sinO = Math.sin(s.raan);
    // ECI unit vector
    const x = cosO * cosu - sinO * sinu * cosi;
    const y = sinO * cosu + cosO * sinu * cosi;
    const z = sinu * sini;
    // Тот же базис, что у project(): x0=Y, y0=Z, z0=X
    const xv = y * Math.cos(VIEW_LON) + x * Math.sin(VIEW_LON);
    const yv = z;
    const zv = -y * Math.sin(VIEW_LON) + x * Math.cos(VIEW_LON);
    const alt = R * 1.22;
    return {
      x: CX + alt * xv,
      y: CY - alt * yv,
      z: zv,
      lat: (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
      lon: (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360,
      front: zv > -0.15,
    };
  }

  // Угловой радиус пятна на Земле (оценка elev≥25° на ~510 км) → ~8° геоцентр
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

  modeBtns.forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.orbitMode));
  });

  const playBtn = document.getElementById("orbit-play");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "Пауза" : "Пуск";
    });
  }

  function drawEarth() {
    // Space
    const g = ctx.createRadialGradient(CX, CY, R * 0.2, CX, CY, R * 2.2);
    g.addColorStop(0, "#121a28");
    g.addColorStop(1, "#070a10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 60; i++) {
      const sx = (i * 97) % W;
      const sy = (i * 53) % H;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }

    // Globe
    const eg = ctx.createRadialGradient(CX - 40, CY - 50, 20, CX, CY, R);
    eg.addColorStop(0, "#3a6b55");
    eg.addColorStop(0.55, "#1e3d32");
    eg.addColorStop(1, "#0c1820");
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let first = true;
      for (let lon = -90; lon <= 90; lon += 6) {
        const p = project(lat, lon);
        if (!p.visible) continue;
        if (first) {
          ctx.moveTo(p.x, p.y);
          first = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Oceans hint
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(92,225,255,0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Russia
    ctx.beginPath();
    let started = false;
    RU_OUTLINE.forEach(([lat, lon]) => {
      const p = project(lat, lon);
      if (!p.visible) return;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(192,0,0,0.28)";
    ctx.fill();
    ctx.strokeStyle = "rgba(251,90,90,0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Labels on panel side
    ctx.fillStyle = "rgba(243,241,239,0.55)";
    ctx.font = "11px Onest, sans-serif";
    ctx.fillText("Арктика / Севморпуть", CX - 30, CY - R - 12);
    ctx.fillText("Экватор", CX - 24, CY + 4);
  }

  function drawFootprint(pos) {
    if (!pos.front) return;
    const lonCentered = ((pos.lon + 540) % 360) - 180;
    const pr = project(pos.lat, lonCentered);
    if (!pr.visible) return;
    const rad = 38;
    const grd = ctx.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, rad);
    grd.addColorStop(0, "rgba(255,176,32,0.35)");
    grd.addColorStop(1, "rgba(255,176,32,0)");
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  function drawSat(pos, linked) {
    if (!pos.front && pos.z < -0.4) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, linked ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = linked ? "#5ce1ff" : "#e8ecf2";
    ctx.fill();
    if (linked) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(92,225,255,0.45)";
      ctx.stroke();
    }
  }

  function drawOrbitHints(time) {
    // One illustrative polar track
    ctx.beginPath();
    ctx.strokeStyle = "rgba(92,225,255,0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    let first = true;
    for (let a = 0; a <= Math.PI * 2; a += 0.08) {
      const s = { raan: 0.4, mean0: a, iRad: (82.3 * Math.PI) / 180 };
      const p = satPos(s, 0);
      if (!p.front) {
        first = true;
        continue;
      }
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    if (playing) simTime += (now - lastFrame) / 1000;
    lastFrame = now;
    const time = simTime;

    canvas.width = W;
    canvas.height = H;
    drawEarth();
    drawOrbitHints(time);

    const positions = sats.map((s) => satPos(s, time));

    // Footprints (cap for performance)
    const showN = Math.min(positions.length, mode === "now" ? 31 : 80);
    for (let i = 0; i < showN; i++) drawFootprint(positions[i]);

    // Laser mesh between nearest front sats (sparse)
    const front = positions
      .map((p, i) => ({ p, i }))
      .filter((o) => o.p.front)
      .slice(0, mode === "now" ? 12 : 40);
    ctx.strokeStyle = "rgba(92,225,255,0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i < front.length; i++) {
      let best = -1;
      let bestD = 1e9;
      for (let j = i + 1; j < front.length; j++) {
        const dx = front[i].p.x - front[j].p.x;
        const dy = front[i].p.y - front[j].p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD && d < 120 * 120) {
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
      drawSat(positions[i], i % 7 === 0);
    }

    // Coverage stats over Russia samples
    let covered = 0;
    SAMPLE.forEach((pt) => {
      const hit = positions.some((p) => coversPoint(p, pt.lat, pt.lon));
      if (hit) covered++;
    });
    const pct = Math.round((covered / SAMPLE.length) * 100);
    if (coverEl) coverEl.textContent = `${pct}%`;
    if (blindEl) {
      blindEl.textContent =
        pct < 55
          ? "Слепые зоны: да — большие разрывы между пролётами"
          : pct < 85
            ? "Слепые зоны: редкие, но ещё есть"
            : "Слепые зоны: минимальны (модель цели)";
    }

    // Side legend drawn in HTML; caption on canvas
    ctx.fillStyle = "#f3f1ef";
    ctx.font = "600 13px Unbounded, sans-serif";
    ctx.fillText("Земля · i ≈ 82.3°", 620, 48);
    ctx.font = "12px Onest, sans-serif";
    ctx.fillStyle = "rgba(243,241,239,0.7)";
    const lines = [
      "Полярные витки идут не только над РФ:",
      "Арктика, океаны, Евразия, Антарктика.",
      "Свой трафик ведёт только своя mesh.",
      "",
      `КА в кадре: ~${showN} из ${sats.length}`,
      "Пятно ≈ зона elev ≥ 25°",
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, 620, 78 + i * 18));

    // Dawn rim accent
    ctx.beginPath();
    ctx.arc(CX, CY, R + 1, -0.9, 0.4);
    ctx.strokeStyle = "rgba(192,0,0,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    requestAnimationFrame(frame);
  }

  setMode("now");
  requestAnimationFrame(frame);
})();
