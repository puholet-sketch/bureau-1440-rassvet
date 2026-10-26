/* 3D орбита: один КА «Рассвет» · Земля со странами · силы · пролёт над РФ
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
  const playBtn = document.getElementById("o3-play");
  const slowBtn = document.getElementById("o3-slow");

  const EARTH_R_KM = 6371;
  const ALT_KM = 510;
  const ORBIT_R_KM = EARTH_R_KM + ALT_KM;
  const INC_DEG = 82.3;
  const SCALE = 1 / 1000; // 1 unit ≈ 1000 km
  const EARTH_R = EARTH_R_KM * SCALE;
  const ORBIT_R = ORBIT_R_KM * SCALE;

  // Реальный период Kepler; на экране виток ускорен до PERIOD_VIS_S
  const PERIOD_REAL_S = 2 * Math.PI * Math.sqrt(Math.pow(ORBIT_R_KM * 1000, 3) / 3.986e14);
  const PERIOD_VIS_S = 28;
  const V_ORBIT_KMS = Math.sqrt(3.986e5 / ORBIT_R_KM); // ≈ 7.6
  const ORBIT_LEN_KM = 2 * Math.PI * ORBIT_R_KM;

  let playing = true;
  let timeScale = 1;
  let meanAnomaly = 1.15;
  let last = performance.now();
  let russiaPolys = null; // MultiPolygon rings [lon,lat]
  let passStats = null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.FogExp2(0x070a10, 0.045);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 80);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2.15;
  controls.maxDistance = 12;

  function geoToWorld(latDeg, lonDeg, radius, earthRotY) {
    const lat = (latDeg * Math.PI) / 180;
    const lonWorld = (lonDeg * Math.PI) / 180 + earthRotY;
    return new THREE.Vector3(
      radius * Math.cos(lat) * Math.sin(lonWorld),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.cos(lonWorld)
    );
  }

  function frameRussiaView(earthRotY) {
    const focus = geoToWorld(58, 95, EARTH_R * 0.92, earthRotY);
    const cam = geoToWorld(62, 100, EARTH_R * 2.55, earthRotY);
    cam.y += EARTH_R * 0.35;
    camera.position.copy(cam);
    controls.target.copy(focus);
    controls.update();
    camera.lookAt(focus);
  }

  scene.add(new THREE.AmbientLight(0x6a7a90, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.35);
  sun.position.set(5, 2, 3);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5ce1ff, 0.25);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  // Звёзды
  {
    const g = new THREE.BufferGeometry();
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 18 + Math.random() * 22;
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
          size: 0.03,
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
      if (prevX !== null && Math.abs(x - prevX) > w * 0.5) {
        // разрыв на антимеридиане
        penDown = false;
      }
      if (!penDown) {
        ctx.moveTo(x, y);
        penDown = true;
      } else {
        ctx.lineTo(x, y);
      }
      prevX = x;
    }
  }

  function paintFeatureFill(ctx, feature, w, h, fillStyle) {
    forEachPolygon(feature, (poly) => {
      const outer = poly[0];
      if (!outer || outer.length < 3) return;
      // простая заливка без dateline-склейки: Natural Earth 110m режет полигоны
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

    // Океан
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#071820");
    g.addColorStop(0.5, "#0c2a38");
    g.addColorStop(1, "#071820");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const features = (geo && geo.features) || [];
    const ru = features.find((f) => f.properties && f.properties.ISO_A3 === "RUS");

    // Все страны (кроме РФ) — спокойный fill
    for (const f of features) {
      if (f === ru) continue;
      paintFeatureFill(ctx, f, w, h, "rgba(36, 78, 58, 0.92)");
    }

    // Границы всех стран
    paintBorders(ctx, features, w, h);

    // Россия поверх — акцент
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

    // Сетка
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

  function satPosition(u) {
    const i = (INC_DEG * Math.PI) / 180;
    return new THREE.Vector3(
      ORBIT_R * Math.cos(u),
      ORBIT_R * Math.sin(u) * Math.sin(i),
      ORBIT_R * Math.sin(u) * Math.cos(i)
    );
  }

  function satVelocity(u) {
    const i = (INC_DEG * Math.PI) / 180;
    return new THREE.Vector3(
      -ORBIT_R * Math.sin(u),
      ORBIT_R * Math.cos(u) * Math.sin(i),
      ORBIT_R * Math.cos(u) * Math.cos(i)
    ).normalize();
  }

  function latLonFromPos(p, earthRotY) {
    const q = p.clone().normalize();
    const lat = (Math.asin(q.y) * 180) / Math.PI;
    let lon = (Math.atan2(q.x, q.z) * 180) / Math.PI;
    lon = ((lon - (earthRotY * 180) / Math.PI + 540) % 360) - 180;
    return { lat, lon };
  }

  /** Статистика пролётов: по разным RAAN (поворот долготы), надир в границах РФ */
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
        const p = satPosition(u);
        const { lat, lon } = latLonFromPos(p, (rotDeg * Math.PI) / 180);
        const o = overRussiaPrecise(lat, lon);
        if (o) {
          count++;
          run++;
          if (run > longest) longest = run;
        } else {
          run = 0;
        }
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
      passKmMed: (longMed / (PERIOD_REAL_S / 60)) * ORBIT_LEN_KM,
      totalMinMed: pick(sortedT, 0.5),
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
    passStats = s;
    if (elPeriod) elPeriod.textContent = `~${Math.round(s.periodMin)} мин (${Math.round(PERIOD_REAL_S)} с)`;
    if (elOrbitLen) elOrbitLen.textContent = fmtKm(s.orbitLenKm);
    if (elPassTime) {
      elPassTime.textContent = `~${s.passMinLo.toFixed(1)}–${s.passMinHi.toFixed(1)} мин (типично ~${s.passMinMed.toFixed(1)})`;
    }
    if (elPassDist) {
      elPassDist.textContent = `${fmtKm(s.passKmLo)} – ${fmtKm(s.passKmHi)}`;
    }
    if (elVisNote) {
      elVisNote.textContent = `На экране виток сжат ≈×${Math.round(s.visFactor)} (реально ~${Math.round(s.periodMin)} мин → ${PERIOD_VIS_S} с анимации).`;
    }
    const box = document.getElementById("o3-facts");
    if (box) {
      box.innerHTML = `
        <p><strong>Оборот:</strong> полный виток по круговой орбите 510 км занимает <strong>~${Math.round(s.periodMin)} мин</strong>
          (~${Math.round(PERIOD_REAL_S)} с). Длина траектории КА за виток — <strong>${fmtKm(s.orbitLenKm)}</strong>
          при скорости <strong>~${s.speed.toFixed(1)} км/с</strong>.</p>
        <p><strong>Над Россией:</strong> если считать «над страной» момент, когда надир (точка под спутником) внутри границ РФ,
          непрерывный пролёт обычно <strong>~${s.passMinLo.toFixed(1)}–${s.passMinHi.toFixed(1)} мин</strong>
          (медиана ≈${s.passMinMed.toFixed(1)} мин) — это <strong>${fmtKm(s.passKmLo)}–${fmtKm(s.passKmHi)}</strong>
          пути по орбите. Зависит от плоскости орбиты (RAAN): часть витков РФ не пересекает (~${Math.round(s.missFrac * 100)}% ориентаций).</p>
        <p><strong>Орбита на рисунке:</strong> да — пунктир = круговой Kepler, h = 510 км, i = 82.3°, e = 0.
          Без J2, сопротивления атмосферы и реальных TLE: учебная модель, не трекинг.</p>
        <p><strong>Карта:</strong> раньше зелёные пятна были декоративным шумом «континентов».
          Сейчас — границы стран Natural Earth 110m; Россия выделена красным.</p>
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
  frameRussiaView(earth.rotation.y);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.035, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.07, side: THREE.BackSide })
  );
  scene.add(atmo);

  // Орбита (наклон i≈82.3°) — совпадает с формулой satPosition
  const orbitCurve = (() => {
    const pts = [];
    for (let k = 0; k <= 256; k++) {
      pts.push(satPosition((k / 256) * Math.PI * 2));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  })();

  const orbitLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitCurve.getPoints(256)),
    new THREE.LineDashedMaterial({
      color: 0x5ce1ff,
      dashSize: 0.08,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.75,
    })
  );
  orbitLine.computeLineDistances();
  scene.add(orbitLine);

  const satGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.04, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.4, roughness: 0.35 })
  );
  satGroup.add(body);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2, roughness: 0.6 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.01, 0.08), panelMat);
  p1.position.x = -0.14;
  const p2 = p1.clone();
  p2.position.x = 0.14;
  satGroup.add(p1, p2);
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.02, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xe02020 })
  );
  accent.position.z = 0.07;
  satGroup.add(accent);
  scene.add(satGroup);

  const foot = new THREE.Mesh(
    new THREE.CircleGeometry(EARTH_R * 0.22, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  scene.add(foot);

  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.55 }));
  scene.add(beam);

  function makeArrow(color) {
    return new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.45, color, 0.1, 0.06);
  }
  const arrowG = makeArrow(0xe02020);
  const arrowV = makeArrow(0x5ce1ff);
  const arrowD = makeArrow(0xffb020);
  scene.add(arrowG, arrowV, arrowD);

  // Статика до загрузки карты
  if (elPeriod) elPeriod.textContent = `~${Math.round(PERIOD_REAL_S / 60)} мин`;
  if (elOrbitLen) elOrbitLen.textContent = fmtKm(ORBIT_LEN_KM);
  if (elVisNote) {
    elVisNote.textContent = `На экране виток сжат ≈×${Math.round(PERIOD_REAL_S / PERIOD_VIS_S)}.`;
  }

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
      console.warn("Карта стран не загрузилась, fallback", err);
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

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      meanAnomaly += ((Math.PI * 2) / PERIOD_VIS_S) * dt * timeScale;
      earth.rotation.y += 0.004 * dt * timeScale;
    }

    const pos = satPosition(meanAnomaly);
    const vel = satVelocity(meanAnomaly);
    satGroup.position.copy(pos);
    satGroup.lookAt(pos.clone().add(vel));
    satGroup.up.copy(pos.clone().normalize());

    const nadir = pos.clone().normalize().multiplyScalar(EARTH_R * 1.002);
    foot.position.copy(nadir);
    foot.lookAt(0, 0, 0);
    beam.geometry.setFromPoints([pos, nadir]);

    const gravDir = pos.clone().normalize().negate();
    arrowG.position.copy(pos);
    arrowG.setDirection(gravDir);
    arrowG.setLength(0.55, 0.1, 0.06);
    arrowV.position.copy(pos);
    arrowV.setDirection(vel);
    arrowV.setLength(0.5, 0.1, 0.06);
    arrowD.position.copy(pos);
    arrowD.setDirection(vel.clone().negate());
    arrowD.setLength(0.22, 0.07, 0.04);

    const { lat, lon } = latLonFromPos(pos, earth.rotation.y);
    const over = overRussiaPrecise(lat, lon);

    // Реальное время текущего пролёта (с учётом ускорения анимации)
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
        const dist = V_ORBIT_KMS * overAccumS;
        elOver.textContent = `над Россией · уже ${fmtMin(overAccumS / 60)} · ${fmtKm(dist)}`;
        elOver.dataset.zone = "ru";
      } else if (lat > 70) {
        elOver.textContent = "Арктика / высокие широты";
        elOver.dataset.zone = "out";
      } else if (Math.abs(lat) < 25) {
        elOver.textContent = "низкие широты / у экватора";
        elOver.dataset.zone = "out";
      } else {
        elOver.textContent = "вне РФ (океан / другая страна)";
        elOver.dataset.zone = "out";
      }
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
