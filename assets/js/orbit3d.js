/* 3D орбита: 3 КА «Рассвет» · Земля со странами · лазер ISL · пролёт над РФ
   Three.js + Kepler; без React — GitHub Pages. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(() => {
  const root = document.getElementById("orbit3d-root");
  if (!root) return;

  const elAlt = document.getElementById("o3-alt");
  const elSpeed = document.getElementById("o3-speed");
  const elLat = document.getElementById("o3-lat");
  const elLon = document.getElementById("o3-lon");
  const elPeriod = document.getElementById("o3-period");
  const elOver = document.getElementById("o3-over");
  const elPassTime = document.getElementById("o3-pass-time");
  const elPassDist = document.getElementById("o3-pass-dist");
  const elOrbitLen = document.getElementById("o3-orbit-len");
  const elVisNote = document.getElementById("o3-vis-note");
  const elLaser = document.getElementById("o3-laser");
  const elLaserDist = document.getElementById("o3-laser-dist");
  const playBtn = document.getElementById("o3-play");
  const slowBtn = document.getElementById("o3-slow");

  const EARTH_R_KM = 6371;
  const ALT_KM = 510;
  const ORBIT_R_KM = EARTH_R_KM + ALT_KM;
  const INC_DEG = 82.3;
  const SCALE = 1 / 1000;
  const EARTH_R = EARTH_R_KM * SCALE;
  const ORBIT_R = ORBIT_R_KM * SCALE;
  const LOS_MIN_R = EARTH_R * 1.06; // луч не должен задевать атмосферу

  const PERIOD_REAL_S = 2 * Math.PI * Math.sqrt(Math.pow(ORBIT_R_KM * 1000, 3) / 3.986e14);
  const PERIOD_VIS_S = 28;
  const V_ORBIT_KMS = Math.sqrt(3.986e5 / ORBIT_R_KM);
  const ORBIT_LEN_KM = 2 * Math.PI * ORBIT_R_KM;
  const C_KM_S = 299792.458;

  let playing = true;
  let timeScale = 1;
  let meanAnomaly = 1.15;
  let last = performance.now();
  let russiaPolys = null;
  let pulseT = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.FogExp2(0x070a10, 0.018);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 120);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 11;
  controls.maxDistance = 36;
  controls.target.set(0, 0, 0);

  /** Весь шар в кадре, Россия чуть к камере */
  function frameFullEarth(earthRotY) {
    const lat = (28 * Math.PI) / 180;
    const lon = (95 * Math.PI) / 180 + earthRotY;
    const dist = EARTH_R * 3.55;
    camera.position.set(
      dist * Math.cos(lat) * Math.sin(lon),
      dist * Math.sin(lat) + EARTH_R * 0.15,
      dist * Math.cos(lat) * Math.cos(lon)
    );
    controls.target.set(0, 0, 0);
    controls.update();
    camera.lookAt(0, 0, 0);
  }

  scene.add(new THREE.AmbientLight(0x6a7a90, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.35);
  sun.position.set(5, 2, 3);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5ce1ff, 0.25);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  {
    const g = new THREE.BufferGeometry();
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 28 + Math.random() * 30;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(
      new THREE.Points(
        g,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.04,
          sizeAttenuation: true,
          opacity: 0.7,
          transparent: true,
        })
      )
    );
  }

  function llToXY(lon, lat, w, h) {
    return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
  }

  function forEachPolygon(feature, fn) {
    const g = feature.geometry;
    if (!g) return;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) fn(poly);
  }

  function drawRingPath(ctx, ring, w, h) {
    if (!ring || ring.length < 2) return;
    let prevX = null;
    let penDown = false;
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const [x, y] = llToXY(lon, lat, w, h);
      if (prevX !== null && Math.abs(x - prevX) > w * 0.5) penDown = false;
      if (!penDown) {
        ctx.moveTo(x, y);
        penDown = true;
      } else ctx.lineTo(x, y);
      prevX = x;
    }
  }

  function paintFeatureFill(ctx, feature, w, h, fillStyle) {
    forEachPolygon(feature, (poly) => {
      const outer = poly[0];
      if (!outer || outer.length < 3) return;
      ctx.beginPath();
      for (let i = 0; i < outer.length; i++) {
        const [x, y] = llToXY(outer[i][0], outer[i][1], w, h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      for (let r = 1; r < poly.length; r++) {
        const hole = poly[r];
        for (let i = 0; i < hole.length; i++) {
          const [x, y] = llToXY(hole[i][0], hole[i][1], w, h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fillStyle = fillStyle;
      ctx.fill("evenodd");
    });
  }

  function paintBorders(ctx, features, w, h) {
    ctx.strokeStyle = "rgba(180, 200, 190, 0.55)";
    ctx.lineWidth = 1.15;
    ctx.lineJoin = "round";
    for (const f of features) {
      forEachPolygon(f, (poly) => {
        for (const ring of poly) {
          ctx.beginPath();
          drawRingPath(ctx, ring, w, h);
          ctx.stroke();
        }
      });
    }
  }

  function makeEarthTexture(geo) {
    const w = 2048;
    const h = 1024;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#071820");
    g.addColorStop(0.5, "#0c2a38");
    g.addColorStop(1, "#071820");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const features = (geo && geo.features) || [];
    const ru = features.find((f) => f.properties && f.properties.ISO_A3 === "RUS");

    for (const f of features) {
      if (f === ru) continue;
      paintFeatureFill(ctx, f, w, h, "rgba(36, 78, 58, 0.92)");
    }
    paintBorders(ctx, features, w, h);

    if (ru) {
      paintFeatureFill(ctx, ru, w, h, "rgba(200, 36, 36, 0.72)");
      ctx.strokeStyle = "#fb5a5a";
      ctx.lineWidth = 2.4;
      forEachPolygon(ru, (poly) => {
        for (const ring of poly) {
          ctx.beginPath();
          drawRingPath(ctx, ring, w, h);
          ctx.stroke();
        }
      });
      const [rx, ry] = llToXY(90, 60, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px Onest, system-ui, sans-serif";
      ctx.fillText("РОССИЯ", rx - 68, ry);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const x = ((lon + 180) / 360) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, ru };
  }

  function extractRussiaPolys(ruFeature) {
    if (!ruFeature) return [];
    const out = [];
    forEachPolygon(ruFeature, (poly) => out.push(poly));
    return out;
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const inter = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
      if (inter) inside = !inside;
    }
    return inside;
  }

  function overRussiaPrecise(lat, lon) {
    if (!russiaPolys || !russiaPolys.length) {
      return lat > 42 && lat < 78 && lon > 28 && lon < 180;
    }
    for (const poly of russiaPolys) {
      if (!pointInRing(lon, lat, poly[0])) continue;
      let inHole = false;
      for (let r = 1; r < poly.length; r++) {
        if (pointInRing(lon, lat, poly[r])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
    return false;
  }

  /** Позиция на круговой орбите i=82.3° с заданным RAAN (рад) */
  function satPosition(u, raan = 0) {
    const i = (INC_DEG * Math.PI) / 180;
    const x0 = ORBIT_R * Math.cos(u);
    const y0 = ORBIT_R * Math.sin(u) * Math.sin(i);
    const z0 = ORBIT_R * Math.sin(u) * Math.cos(i);
    const c = Math.cos(raan);
    const s = Math.sin(raan);
    return new THREE.Vector3(c * x0 + s * z0, y0, -s * x0 + c * z0);
  }

  function satVelocity(u, raan = 0) {
    const i = (INC_DEG * Math.PI) / 180;
    const dx0 = -ORBIT_R * Math.sin(u);
    const dy0 = ORBIT_R * Math.cos(u) * Math.sin(i);
    const dz0 = ORBIT_R * Math.cos(u) * Math.cos(i);
    const c = Math.cos(raan);
    const s = Math.sin(raan);
    return new THREE.Vector3(c * dx0 + s * dz0, dy0, -s * dx0 + c * dz0).normalize();
  }

  function latLonFromPos(p, earthRotY) {
    const q = p.clone().normalize();
    const lat = (Math.asin(q.y) * 180) / Math.PI;
    let lon = (Math.atan2(q.x, q.z) * 180) / Math.PI;
    lon = ((lon - (earthRotY * 180) / Math.PI + 540) % 360) - 180;
    return { lat, lon };
  }

  /** LOS: хорда КА–КА не пересекает Землю+атмосферу */
  function hasLaserLos(a, b) {
    const ab = b.clone().sub(a);
    const lenSq = ab.lengthSq();
    if (lenSq < 1e-8) return false;
    const t = Math.max(0, Math.min(1, -a.dot(ab) / lenSq));
    const closest = a.clone().add(ab.multiplyScalar(t));
    return closest.length() > LOS_MIN_R;
  }

  function computePassStats() {
    const N = 1600;
    const longestMins = [];
    const totalMins = [];
    for (let rotDeg = 0; rotDeg < 360; rotDeg += 6) {
      let count = 0;
      let run = 0;
      let longest = 0;
      for (let k = 0; k < N; k++) {
        const u = (k / N) * Math.PI * 2;
        const p = satPosition(u, 0);
        const { lat, lon } = latLonFromPos(p, (rotDeg * Math.PI) / 180);
        const o = overRussiaPrecise(lat, lon);
        if (o) {
          count++;
          run++;
          if (run > longest) longest = run;
        } else run = 0;
      }
      totalMins.push((count / N) * (PERIOD_REAL_S / 60));
      longestMins.push((longest / N) * (PERIOD_REAL_S / 60));
    }
    const sortedL = longestMins.filter((x) => x > 0.2).sort((a, b) => a - b);
    const sortedT = totalMins.filter((x) => x > 0.2).sort((a, b) => a - b);
    const pick = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] || 0;
    const longLo = pick(sortedL, 0.2);
    const longHi = pick(sortedL, 0.9);
    const longMed = pick(sortedL, 0.5);
    return {
      periodMin: PERIOD_REAL_S / 60,
      orbitLenKm: ORBIT_LEN_KM,
      speed: V_ORBIT_KMS,
      passMinLo: longLo,
      passMinHi: longHi,
      passMinMed: longMed,
      passKmLo: (longLo / (PERIOD_REAL_S / 60)) * ORBIT_LEN_KM,
      passKmHi: (longHi / (PERIOD_REAL_S / 60)) * ORBIT_LEN_KM,
      missFrac: longestMins.filter((x) => x < 0.2).length / longestMins.length,
      visFactor: PERIOD_REAL_S / PERIOD_VIS_S,
    };
  }

  function fmtMin(m) {
    if (m < 1) return `${Math.round(m * 60)} с`;
    const whole = Math.floor(m);
    const sec = Math.round((m - whole) * 60);
    return sec ? `${whole} мин ${sec} с` : `${whole} мин`;
  }

  function fmtKm(km) {
    if (km >= 1000) return `~${(km / 1000).toFixed(1)} тыс. км`;
    return `~${Math.round(km)} км`;
  }

  function publishPassStats(s) {
    if (elPeriod) elPeriod.textContent = `~${Math.round(s.periodMin)} мин (${Math.round(PERIOD_REAL_S)} с)`;
    if (elOrbitLen) elOrbitLen.textContent = fmtKm(s.orbitLenKm);
    if (elPassTime) {
      elPassTime.textContent = `~${s.passMinLo.toFixed(1)}–${s.passMinHi.toFixed(1)} мин (типично ~${s.passMinMed.toFixed(1)})`;
    }
    if (elPassDist) elPassDist.textContent = `${fmtKm(s.passKmLo)} – ${fmtKm(s.passKmHi)}`;
    if (elVisNote) {
      elVisNote.textContent = `На экране виток сжат ≈×${Math.round(s.visFactor)} (реально ~${Math.round(s.periodMin)} мин → ${PERIOD_VIS_S} с).`;
    }
    const box = document.getElementById("o3-facts");
    if (box) {
      box.innerHTML = `
        <p><strong>Оборот:</strong> ~${Math.round(s.periodMin)} мин, путь за виток ${fmtKm(s.orbitLenKm)}, ~${s.speed.toFixed(1)} км/с.</p>
        <p><strong>Над РФ:</strong> непрерывный пролёт ~${s.passMinLo.toFixed(1)}–${s.passMinHi.toFixed(1)} мин
          (${fmtKm(s.passKmLo)}–${fmtKm(s.passKmHi)}); ~${Math.round(s.missFrac * 100)}% ориентаций плоскости РФ не пересекают.</p>
        <p><strong>3 КА + лазер:</strong> A и B — одна плоскость (соседи по фазе), C — соседняя плоскость (ΔRAAN).
          Голубые линии — ISL, если хорда не пересекает Землю. Пульс — учебный «пакет» (свет в реальности летит за миллисекунды).</p>
        <p><strong>Орбита:</strong> круговой Kepler h=510 км, i=82.3°. Карта — Natural Earth 110m, РФ красным.</p>
      `;
    }
  }

  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x0c2a38,
    roughness: 0.85,
    metalness: 0.05,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), earthMat);
  earth.rotation.y = 0.15;
  scene.add(earth);
  frameFullEarth(earth.rotation.y);

  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.035, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.07, side: THREE.BackSide })
    )
  );

  // Две плоскости орбиты (пунктир)
  function addOrbitLine(raan, opacity) {
    const pts = [];
    for (let k = 0; k <= 256; k++) pts.push(satPosition((k / 256) * Math.PI * 2, raan));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({
        color: 0x5ce1ff,
        dashSize: 0.1,
        gapSize: 0.07,
        transparent: true,
        opacity,
      })
    );
    line.computeLineDistances();
    scene.add(line);
    return line;
  }
  const RAAN_B = 0;
  const RAAN_C = (30 * Math.PI) / 180; // соседняя плоскость (~как шаг при 12 плоскостях)
  addOrbitLine(RAAN_B, 0.7);
  addOrbitLine(RAAN_C, 0.35);

  function makeSat(accentColor, scale = 1) {
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * scale, 0.04 * scale, 0.12 * scale),
        new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.4, roughness: 0.35 })
      )
    );
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2, roughness: 0.6 });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, 0.01 * scale, 0.08 * scale), panelMat);
    p1.position.x = -0.14 * scale;
    const p2 = p1.clone();
    p2.position.x = 0.14 * scale;
    g.add(p1, p2);
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.025 * scale, 0.025 * scale, 0.025 * scale),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    accent.position.z = 0.07 * scale;
    g.add(accent);
    scene.add(g);
    return g;
  }

  // A — ведущий; B — сосед по плоскости; C — соседняя плоскость
  const PHASE_B = (72 * Math.PI) / 180;
  const PHASE_C = (40 * Math.PI) / 180;
  const satA = makeSat(0xe02020, 1.15);
  const satB = makeSat(0x5ce1ff, 1);
  const satC = makeSat(0xffb020, 1);

  const footMat = new THREE.MeshBasicMaterial({
    color: 0xffb020,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const footA = new THREE.Mesh(new THREE.CircleGeometry(EARTH_R * 0.2, 40), footMat);
  const footB = new THREE.Mesh(new THREE.CircleGeometry(EARTH_R * 0.16, 32), footMat.clone());
  footB.material.opacity = 0.18;
  const footC = new THREE.Mesh(new THREE.CircleGeometry(EARTH_R * 0.16, 32), footMat.clone());
  footC.material.opacity = 0.18;
  scene.add(footA, footB, footC);

  const beamA = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.45 })
  );
  scene.add(beamA);

  function makeArrow(color) {
    return new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.45, color, 0.1, 0.06);
  }
  const arrowG = makeArrow(0xe02020);
  const arrowV = makeArrow(0x5ce1ff);
  const arrowD = makeArrow(0xffb020);
  scene.add(arrowG, arrowV, arrowD);

  // Лазерные линки + пульсы пакетов
  function makeLaserLink() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.85 })
    );
    scene.add(line);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    scene.add(pulse);
    const pulse2 = pulse.clone();
    pulse2.material = pulse.material.clone();
    pulse2.material.color.set(0x5ce1ff);
    scene.add(pulse2);
    return { line, pulse, pulse2, geo };
  }
  const linkAB = makeLaserLink();
  const linkAC = makeLaserLink();
  const linkBC = makeLaserLink();

  if (elPeriod) elPeriod.textContent = `~${Math.round(PERIOD_REAL_S / 60)} мин`;
  if (elOrbitLen) elOrbitLen.textContent = fmtKm(ORBIT_LEN_KM);
  if (elVisNote) elVisNote.textContent = `На экране виток сжат ≈×${Math.round(PERIOD_REAL_S / PERIOD_VIS_S)}.`;

  fetch(new URL("../data/countries-110m.geojson", import.meta.url))
    .then((r) => {
      if (!r.ok) throw new Error("geojson " + r.status);
      return r.json();
    })
    .then((geo) => {
      const { tex, ru } = makeEarthTexture(geo);
      earthMat.map = tex;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
      russiaPolys = extractRussiaPolys(ru);
      publishPassStats(computePassStats());
    })
    .catch((err) => {
      console.warn("Карта стран не загрузилась", err);
      const { tex } = makeEarthTexture({ features: [] });
      earthMat.map = tex;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
      publishPassStats(computePassStats());
    });

  function resize() {
    const w = root.clientWidth || 800;
    const h = root.clientHeight || 480;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(root);

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "Пауза" : "Пуск";
    });
  }
  if (slowBtn) {
    slowBtn.addEventListener("click", () => {
      timeScale = timeScale === 1 ? 0.35 : timeScale === 0.35 ? 2.2 : 1;
      slowBtn.textContent =
        timeScale === 1 ? "Скорость ×1" : timeScale < 1 ? "Скорость ×0.35" : "Скорость ×2.2";
    });
  }

  let overAccumS = 0;
  let overActive = false;

  function placeSat(mesh, foot, u, raan, withBeam) {
    const pos = satPosition(u, raan);
    const vel = satVelocity(u, raan);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(vel));
    mesh.up.copy(pos.clone().normalize());
    const nadir = pos.clone().normalize().multiplyScalar(EARTH_R * 1.002);
    foot.position.copy(nadir);
    foot.lookAt(0, 0, 0);
    if (withBeam) beamA.geometry.setFromPoints([pos, nadir]);
    return { pos, vel };
  }

  function updateLink(link, a, b, active, phase) {
    link.line.visible = true;
    link.line.geometry.setFromPoints([a, b]);
    link.line.material.opacity = active ? 0.9 : 0.12;
    link.line.material.color.set(active ? 0x5ce1ff : 0x3a4555);
    link.pulse.visible = active;
    link.pulse2.visible = active;
    if (active) {
      const t1 = (phase % 1 + 1) % 1;
      const t2 = (t1 + 0.5) % 1;
      link.pulse.position.lerpVectors(a, b, t1);
      link.pulse2.position.lerpVectors(a, b, t2);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      meanAnomaly += ((Math.PI * 2) / PERIOD_VIS_S) * dt * timeScale;
      earth.rotation.y += 0.003 * dt * timeScale;
      pulseT += dt * timeScale * 0.55;
    }

    const uA = meanAnomaly;
    const uB = meanAnomaly + PHASE_B;
    const uC = meanAnomaly + PHASE_C;

    const A = placeSat(satA, footA, uA, RAAN_B, true);
    const B = placeSat(satB, footB, uB, RAAN_B, false);
    const C = placeSat(satC, footC, uC, RAAN_C, false);

    const gravDir = A.pos.clone().normalize().negate();
    arrowG.position.copy(A.pos);
    arrowG.setDirection(gravDir);
    arrowG.setLength(0.55, 0.1, 0.06);
    arrowV.position.copy(A.pos);
    arrowV.setDirection(A.vel);
    arrowV.setLength(0.5, 0.1, 0.06);
    arrowD.position.copy(A.pos);
    arrowD.setDirection(A.vel.clone().negate());
    arrowD.setLength(0.22, 0.07, 0.04);

    const losAB = hasLaserLos(A.pos, B.pos);
    const losAC = hasLaserLos(A.pos, C.pos);
    const losBC = hasLaserLos(B.pos, C.pos);
    updateLink(linkAB, A.pos, B.pos, losAB, pulseT);
    updateLink(linkAC, A.pos, C.pos, losAC, pulseT + 0.33);
    updateLink(linkBC, B.pos, C.pos, losBC, pulseT + 0.66);

    const activeLinks = [
      losAB && { name: "A↔B (одна плоскость)", d: A.pos.distanceTo(B.pos) / SCALE },
      losAC && { name: "A↔C (межплоскостной)", d: A.pos.distanceTo(C.pos) / SCALE },
      losBC && { name: "B↔C", d: B.pos.distanceTo(C.pos) / SCALE },
    ].filter(Boolean);

    const { lat, lon } = latLonFromPos(A.pos, earth.rotation.y);
    const over = overRussiaPrecise(lat, lon);
    const realDt = playing ? dt * timeScale * (PERIOD_REAL_S / PERIOD_VIS_S) : 0;
    if (over) {
      overAccumS += realDt;
      overActive = true;
    } else if (overActive) {
      overActive = false;
      overAccumS = 0;
    }

    if (elAlt) elAlt.textContent = `~${ALT_KM} км`;
    if (elSpeed) elSpeed.textContent = `~${V_ORBIT_KMS.toFixed(1)} км/с`;
    if (elLat) elLat.textContent = `${lat.toFixed(1)}°`;
    if (elLon) elLon.textContent = `${lon.toFixed(1)}°`;
    if (elOver) {
      if (over) {
        elOver.textContent = `КА-A над РФ · ${fmtMin(overAccumS / 60)} · ${fmtKm(V_ORBIT_KMS * overAccumS)}`;
        elOver.dataset.zone = "ru";
      } else if (lat > 70) {
        elOver.textContent = "КА-A: Арктика / высокие широты";
        elOver.dataset.zone = "out";
      } else if (Math.abs(lat) < 25) {
        elOver.textContent = "КА-A: низкие широты / у экватора";
        elOver.dataset.zone = "out";
      } else {
        elOver.textContent = "КА-A: вне РФ";
        elOver.dataset.zone = "out";
      }
    }

    if (elLaser) {
      if (!activeLinks.length) {
        elLaser.textContent = "нет LOS (Земля перекрывает)";
        elLaser.dataset.zone = "out";
      } else {
        elLaser.textContent = `${activeLinks.length}/3 линка · ${activeLinks.map((l) => l.name).join(", ")}`;
        elLaser.dataset.zone = "ru";
      }
    }
    if (elLaserDist) {
      if (!activeLinks.length) elLaserDist.textContent = "—";
      else {
        const d = activeLinks[0].d;
        const ms = (d / C_KM_S) * 1000;
        elLaserDist.textContent = `${fmtKm(d)} · свет ~${ms.toFixed(1)} мс`;
      }
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
