/* 2D группировка: шар с территорией РФ, КА на орбите, покрытие красной зоны */
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
  const CY = 290;
  const R = 210;

  let MODES = {
    now: {
      label: "Сейчас ~31",
      planes: 3,
      perPlane: 10,
      note: "Ранняя серия: 3 плоскости × 10 КА — много «дыр» на красной РФ",
    },
    target: {
      label: "Цель ~252",
      planes: 12,
      perPlane: 21,
      note: "12×21: пятна почти сплошь закрывают красную территорию",
    },
  };

  fetch("data/constellation.json")
    .then((r) => r.json())
    .then((data) => {
      if (!data) return;
      MODES.now = {
        label: `Сейчас ~${data.current.active_approx}`,
        planes: data.current.model.planes,
        perPlane: data.current.model.per_plane,
        note: data.current.model.note || MODES.now.note,
      };
      MODES.target = {
        label: `Цель ~${data.target_company.active_approx}`,
        planes: data.target_company.model.planes,
        perPlane: data.target_company.model.per_plane,
        note: `Госплан ${data.gov_plan.active}`,
      };
      const nowBtn = document.querySelector('[data-orbit-mode="now"]');
      const tgtBtn = document.querySelector('[data-orbit-mode="target"]');
      if (nowBtn) nowBtn.textContent = MODES.now.label;
      if (tgtBtn) tgtBtn.textContent = MODES.target.label;
      if (typeof setMode === "function") setMode(mode);
    })
    .catch(() => {});

  let mode = "now";
  let simTime = 0;
  let lastFrame = 0;
  let playing = true;
  let sats = [];

  // Центр кадра ≈ Сибирь: Россия лицом к зрителю, крупно
  const VIEW_LON = (100 * Math.PI) / 180;

  function project(lat, lon) {
    const φ = (lat * Math.PI) / 180;
    const λ = (lon * Math.PI) / 180;
    const x0 = Math.cos(φ) * Math.sin(λ);
    const y0 = Math.sin(φ);
    const z0 = Math.cos(φ) * Math.cos(λ);
    const xv = x0 * Math.cos(VIEW_LON) + z0 * Math.sin(VIEW_LON);
    const yv = y0;
    const zv = -x0 * Math.sin(VIEW_LON) + z0 * Math.cos(VIEW_LON);
    return { x: CX + R * xv, y: CY - R * yv, z: zv, visible: zv > -0.05 };
  }

  // Контур РФ плотнее — читаемая «красная страна», не точка
  const RU_OUTLINE = [
    [70, 28], [69, 40], [70, 55], [72, 70], [74, 90], [75, 110], [73, 130],
    [72, 150], [70, 170], [68, 180], [64, 178], [60, 170], [56, 160],
    [52, 145], [50, 140], [48, 135], [46, 132], [49, 100], [51, 70],
    [53, 50], [55, 40], [58, 35], [62, 30], [66, 28], [70, 28],
  ];

  const SAMPLE = [];
  for (let lat = 48; lat <= 72; lat += 3) {
    for (let lon = 30; lon <= 170; lon += 6) {
      if (lat < 52 && lon > 55 && lon < 120) continue;
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
    const u = s.mean0 + time * 0.18;
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

  function chip(x, y, text, fill) {
    ctx.font = "600 12px Onest, sans-serif";
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = fill || "rgba(7,10,16,0.82)";
    ctx.strokeStyle = "rgba(243,241,239,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, 22, 2);
    else ctx.rect(x, y, w, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f3f1ef";
    ctx.fillText(text, x + 8, y + 15);
  }

  function clipGlobe(fn) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R - 0.5, 0, Math.PI * 2);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function drawEarth() {
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 60; i++) {
      ctx.fillRect((i * 97) % W, (i * 53) % H, 1, 1);
    }

    // Заголовок кадра
    chip(16, 14, "Земля · вид на Россию (центр кадра — Сибирь)", "rgba(7,10,16,0.85)");

    const eg = ctx.createRadialGradient(CX - 40, CY - 50, 20, CX, CY, R);
    eg.addColorStop(0, "#3a6a5a");
    eg.addColorStop(0.55, "#1a3a32");
    eg.addColorStop(1, "#0a1520");
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();

    clipGlobe(() => {
      // Сетка
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let first = true;
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = project(lat, lon);
          if (!p.visible) {
            first = true;
            continue;
          }
          if (first) {
            ctx.moveTo(p.x, p.y);
            first = false;
          } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Экватор — жирнее
      ctx.beginPath();
      let eqFirst = true;
      for (let lon = -180; lon <= 180; lon += 3) {
        const p = project(0, lon);
        if (!p.visible) {
          eqFirst = true;
          continue;
        }
        if (eqFirst) {
          ctx.moveTo(p.x, p.y);
          eqFirst = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(243,241,239,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Россия — заливка территории
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
      ctx.fillStyle = "rgba(224, 40, 40, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "#fb5a5a";
      ctx.lineWidth = 2.25;
      ctx.stroke();
    });

    // Обводка шара
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(92,225,255,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Подпись России — к центру территории (не на краю)
    const ruLabel = project(62, 95);
    if (ruLabel.visible) {
      chip(ruLabel.x - 36, ruLabel.y - 11, "Россия", "rgba(160,16,16,0.92)");
    }

    const eqLabel = project(0, 100);
    if (eqLabel.visible) {
      chip(eqLabel.x - 32, eqLabel.y + 6, "экватор", "rgba(7,10,16,0.7)");
    }

    const kam = project(56, 160);
    if (kam.visible) {
      chip(kam.x - 28, kam.y - 10, "Камчатка", "rgba(7,10,16,0.7)");
    }
  }

  function drawOrbitRing() {
    ctx.beginPath();
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = "rgba(92,225,255,0.45)";
    ctx.lineWidth = 1.5;
    let first = true;
    let top = null;
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
      const s = { raan: 0.2, mean0: a, iRad: (82.3 * Math.PI) / 180 };
      const p = satPos(s, 0);
      if (!p.front) {
        first = true;
        continue;
      }
      if (!top || p.y < top.y) top = p;
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (top) {
      chip(top.x - 90, top.y - 28, "орбита КА над Землёй · i≈82.3°", "rgba(8,28,36,0.9)");
    }
  }

  function drawCoverageOnRussia(positions) {
    // Янтарные точки только НА территории РФ — видно, закрыта ли страна
    SAMPLE.forEach((pt) => {
      const pr = project(pt.lat, pt.lon);
      if (!pr.visible) return;
      const ok = positions.some((p) => coversPoint(p, pt.lat, pt.lon));
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, ok ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = ok ? "rgba(255,176,32,0.85)" : "rgba(80,30,30,0.55)";
      ctx.fill();
    });
  }

  function drawSat(pos, highlight) {
    if (!pos.front && pos.z < -0.4) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, highlight ? 4.2 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = highlight ? "#5ce1ff" : "#f3f1ef";
    ctx.fill();
    if (highlight) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(92,225,255,0.5)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    if (playing) simTime += (now - lastFrame) / 1000;
    lastFrame = now;

    canvas.width = W;
    canvas.height = H;
    drawEarth();
    drawOrbitRing();

    const positions = sats.map((s) => satPos(s, simTime));
    const showN = Math.min(positions.length, mode === "now" ? 31 : 80);
    const visible = positions.slice(0, showN);

    drawCoverageOnRussia(visible);

    // Mesh только между ближними КА на переднем плане
    const front = visible.filter((p) => p.front);
    ctx.strokeStyle = "rgba(92,225,255,0.22)";
    ctx.lineWidth = 1;
    const meshN = Math.min(front.length, mode === "now" ? 14 : 28);
    for (let i = 0; i < meshN; i++) {
      let best = -1;
      let bestD = 1e9;
      for (let j = i + 1; j < meshN; j++) {
        const dx = front[i].x - front[j].x;
        const dy = front[i].y - front[j].y;
        const d = dx * dx + dy * dy;
        if (d < bestD && d < 110 * 110) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0) {
        ctx.beginPath();
        ctx.moveTo(front[i].x, front[i].y);
        ctx.lineTo(front[best].x, front[best].y);
        ctx.stroke();
      }
    }

    let labelIdx = -1;
    for (let i = 0; i < front.length; i++) {
      if (front[i].x > CX && front[i].y < CY) {
        labelIdx = i;
        break;
      }
    }
    if (labelIdx < 0 && front.length) labelIdx = 0;

    visible.forEach((p) => {
      const isLabel = labelIdx >= 0 && front[labelIdx] === p;
      drawSat(p, isLabel);
    });

    if (labelIdx >= 0) {
      const p = front[labelIdx];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 40, p.y - 32);
      ctx.strokeStyle = "rgba(243,241,239,0.4)";
      ctx.stroke();
      chip(p.x + 40, p.y - 42, "КА «Рассвет»", "rgba(7,10,16,0.88)");
    }

    let covered = 0;
    SAMPLE.forEach((pt) => {
      if (visible.some((p) => coversPoint(p, pt.lat, pt.lon))) covered += 1;
    });
    const pct = Math.round((covered / SAMPLE.length) * 100);
    if (coverEl) coverEl.textContent = `${pct}%`;
    if (countEl) countEl.textContent = `${showN} из ${sats.length}`;
    if (blindEl) {
      blindEl.textContent =
        pct < 55
          ? "Красная РФ: много тёмных точек — нет спутника над зоной"
          : pct < 85
            ? "Ещё есть тёмные точки на РФ"
            : "Красная РФ почти вся под янтарными точками (модель цели)";
    }

    requestAnimationFrame(frame);
  }

  setMode("now");
  requestAnimationFrame(frame);
})();
