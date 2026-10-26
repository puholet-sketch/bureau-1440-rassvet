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
  const elGround = document.getElementById("o3-ground");
  const playBtn = document.getElementById("o3-play");
  const slowBtn = document.getElementById("o3-slow");
  const MIN_ELEV_DEG = 20; // минимальный угол места для радио Земля↔КА
  const _yUp = new THREE.Vector3(0, 1, 0);
  const _linkDir = new THREE.Vector3();
  const satHud = {
    a: {
      where: document.getElementById("o3-a-where"),
      lat: document.getElementById("o3-a-lat"),
      lon: document.getElementById("o3-a-lon"),
      phase: document.getElementById("o3-a-phase"),
      plane: document.getElementById("o3-a-plane"),
    },
    b: {
      where: document.getElementById("o3-b-where"),
      lat: document.getElementById("o3-b-lat"),
      lon: document.getElementById("o3-b-lon"),
      phase: document.getElementById("o3-b-phase"),
      plane: document.getElementById("o3-b-plane"),
    },
    c: {
      where: document.getElementById("o3-c-where"),
      lat: document.getElementById("o3-c-lat"),
      lon: document.getElementById("o3-c-lon"),
      phase: document.getElementById("o3-c-phase"),
      plane: document.getElementById("o3-c-plane"),
    },
  };

  const EARTH_R_KM = 6371;
  const ALT_KM = 510;
  const ORBIT_R_KM = EARTH_R_KM + ALT_KM;
  const INC_DEG = 82.3;
  const SCALE = 1 / 1000;
  const EARTH_R = EARTH_R_KM * SCALE;
  const ORBIT_R = ORBIT_R_KM * SCALE;
  const LOS_MIN_R = EARTH_R * 1.06; // луч не должен задевать атмосферу
  const MAX_ISL_KM = 1000; // учебный потолок дальности ISL «Рассвет»

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

  /** Весь шар: РФ + Камчатка к камере */
  function frameFullEarth(earthRotY) {
    const lat = (32 * Math.PI) / 180;
    const lon = (130 * Math.PI) / 180 + earthRotY;
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
        <p><strong>Фаза:</strong> положение КА вдоль орбиты (угол u). A — опора; B — +фаза в той же плоскости;
          C — другой RAAN + своя фаза.</p>
        <p><strong>Лазер ISL:</strong> ≤~${MAX_ISL_KM}&nbsp;км и LOS (хорда без Земли). Красная трубка = линк жив.</p>
        <p><strong>Камчатка:</strong> на поверхности шлюз (feeder), терминал (user) и БС.
          Жёлто/голубые лучи — радио Земля↔КА при угле места ≥${MIN_ELEV_DEG}°.</p>
        <p><strong>Орбита:</strong> Kepler h=510 км, i=82.3°. Карта — Natural Earth 110m.</p>
      `;
      if (typeof window.applyGlossary === "function") {
        window.applyGlossary(box);
      }
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

  /** Локальные координаты на поверхности (без earth.rotation — маркеры children of earth) */
  function latLonLocal(latDeg, lonDeg, radius) {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    return new THREE.Vector3(
      radius * Math.cos(lat) * Math.sin(lon),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.cos(lon)
    );
  }

  function makeLabelSprite(text, color) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(7,10,16,0.82)";
    ctx.fillRect(8, 12, 240, 40);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 12, 240, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px Onest, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 40);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );
    spr.scale.set(1.15, 0.29, 1);
    return spr;
  }

  // Камчатка: шлюз / терминал / БС на поверхности
  const GROUND_SITES = [
    {
      id: "gw",
      name: "Шлюз",
      full: "Шлюз (feeder Ka)",
      lat: 53.05,
      lon: 158.65,
      color: 0xe02020,
      role: "gateway",
    },
    {
      id: "term",
      name: "Терминал",
      full: "Терминал (user Ku/Ka)",
      lat: 52.85,
      lon: 158.25,
      color: 0x5ce1ff,
      role: "terminal",
    },
    {
      id: "bs",
      name: "БС 5G",
      full: "Базовая станция",
      lat: 53.35,
      lon: 159.1,
      color: 0xffb020,
      role: "bs",
    },
  ];

  const groundGroup = new THREE.Group();
  earth.add(groundGroup);
  const groundMarkers = GROUND_SITES.map((site) => {
    const g = new THREE.Group();
    const pos = latLonLocal(site.lat, site.lon, EARTH_R * 1.004);
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(_yUp, pos.clone().normalize());

    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.2, 8),
      new THREE.MeshBasicMaterial({ color: site.color })
    );
    pin.position.y = 0.14;
    g.add(pin);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.1, 8),
      new THREE.MeshBasicMaterial({ color: site.color })
    );
    stem.position.y = 0.05;
    g.add(stem);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.15, 28),
      new THREE.MeshBasicMaterial({
        color: site.color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.008;
    g.add(ring);

    const label = makeLabelSprite(site.name, `#${site.color.toString(16).padStart(6, "0")}`);
    label.position.set(0, 0.38, 0);
    g.add(label);

    groundGroup.add(g);
    return { ...site, group: g, world: new THREE.Vector3() };
  });

  function makeRfLink(color) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    scene.add(tube);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    scene.add(pulse);
    return { tube, pulse, color };
  }
  const rfLinks = groundMarkers.map((m) =>
    makeRfLink(m.role === "gateway" ? 0xff6060 : m.role === "bs" ? 0xffb020 : 0x7af0ff)
  );

  function elevationDeg(gsWorld, satWorld) {
    const up = gsWorld.clone().normalize();
    const toSat = satWorld.clone().sub(gsWorld);
    const dist = toSat.length();
    if (dist < 1e-6) return -90;
    toSat.multiplyScalar(1 / dist);
    return (Math.asin(THREE.MathUtils.clamp(up.dot(toSat), -1, 1)) * 180) / Math.PI;
  }

  function updateRfLink(link, from, to, active, phase) {
    if (!active) {
      link.tube.visible = false;
      link.pulse.visible = false;
      return;
    }
    _linkDir.subVectors(to, from);
    const len = _linkDir.length();
    if (len < 1e-6) {
      link.tube.visible = false;
      link.pulse.visible = false;
      return;
    }
    const mid = from.clone().add(to).multiplyScalar(0.5);
    link.tube.visible = true;
    link.tube.position.copy(mid);
    link.tube.scale.set(1, len, 1);
    link.tube.quaternion.setFromUnitVectors(_yUp, _linkDir.normalize());
    link.tube.material.opacity = 0.92;
    link.tube.material.color.set(link.color);
    link.pulse.visible = true;
    const t = (phase % 1 + 1) % 1;
    link.pulse.position.lerpVectors(from, to, t);
  }

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
  // Плоскости: A/B — одна; C — соседняя. Фазы подобраны так, чтобы хорда ≈0.7–1.0 тыс. км
  // (при 72° раньше линк почти всегда резала Земля — угловой запас LOS на 510 км ≈ ±22°).
  const RAAN_A = 0;
  const RAAN_C = (10 * Math.PI) / 180;
  addOrbitLine(RAAN_A, 0.7);
  addOrbitLine(RAAN_C, 0.4);

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

  // Фаза ≈ угол вдоль витка. ~8° на R=6881 км → хорда ≈960 км (в пределах MAX_ISL_KM)
  const PHASE_A = 0;
  const PHASE_B = (8 * Math.PI) / 180;
  const PHASE_C = (5 * Math.PI) / 180;
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

  // Жирный лазер (цилиндр — LineBasic linewidth в WebGL почти не работает)
  function makeLaserLink() {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe02020,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    scene.add(tube);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    scene.add(glow);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
    );
    scene.add(pulse);
    const pulse2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff8080, transparent: true, opacity: 0.95 })
    );
    scene.add(pulse2);
    return { tube, glow, pulse, pulse2 };
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
    _linkDir.subVectors(b, a);
    const len = _linkDir.length();
    if (len < 1e-6) {
      link.tube.visible = false;
      link.glow.visible = false;
      link.pulse.visible = false;
      link.pulse2.visible = false;
      return;
    }
    const mid = a.clone().add(b).multiplyScalar(0.5);
    link.tube.visible = true;
    link.glow.visible = true;
    link.tube.position.copy(mid);
    link.glow.position.copy(mid);
    link.tube.scale.set(active ? 1.15 : 0.55, len, active ? 1.15 : 0.55);
    link.glow.scale.set(active ? 1 : 0.45, len, active ? 1 : 0.45);
    link.tube.quaternion.setFromUnitVectors(_yUp, _linkDir.normalize());
    link.glow.quaternion.copy(link.tube.quaternion);
    link.tube.material.opacity = active ? 0.98 : 0.14;
    link.tube.material.color.set(active ? 0xe02020 : 0x4a3030);
    link.glow.material.opacity = active ? 0.32 : 0.05;
    link.pulse.visible = active;
    link.pulse2.visible = active;
    if (active) {
      const t1 = (phase % 1 + 1) % 1;
      const t2 = (t1 + 0.5) % 1;
      link.pulse.position.lerpVectors(a, b, t1);
      link.pulse2.position.lerpVectors(a, b, t2);
    }
  }

  function zoneLabel(lat, lon) {
    if (overRussiaPrecise(lat, lon)) return { text: "над Россией", zone: "ru" };
    if (lat > 70) return { text: "Арктика", zone: "out" };
    if (lat < -70) return { text: "Антарктика", zone: "out" };
    if (Math.abs(lat) < 25) return { text: "у экватора", zone: "out" };
    return { text: "вне РФ", zone: "out" };
  }

  function fillSatCol(key, lat, lon, phaseDeg, planeLabel) {
    const h = satHud[key];
    if (!h) return;
    const z = zoneLabel(lat, lon);
    if (h.where) {
      h.where.textContent = z.text;
      h.where.dataset.zone = z.zone;
    }
    if (h.lat) h.lat.textContent = `${lat.toFixed(1)}°`;
    if (h.lon) h.lon.textContent = `${lon.toFixed(1)}°`;
    if (h.phase) h.phase.textContent = `${phaseDeg.toFixed(1)}°`;
    if (h.plane) h.plane.textContent = planeLabel;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      meanAnomaly += ((Math.PI * 2) / PERIOD_VIS_S) * dt * timeScale;
      earth.rotation.y += 0.003 * dt * timeScale;
      pulseT += dt * timeScale * 0.55;
    }

    const uA = meanAnomaly + PHASE_A;
    const uB = meanAnomaly + PHASE_B;
    const uC = meanAnomaly + PHASE_C;

    const A = placeSat(satA, footA, uA, RAAN_A, true);
    const B = placeSat(satB, footB, uB, RAAN_A, false);
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

    const dAB = A.pos.distanceTo(B.pos) / SCALE;
    const dAC = A.pos.distanceTo(C.pos) / SCALE;
    const dBC = B.pos.distanceTo(C.pos) / SCALE;
    const okAB = dAB <= MAX_ISL_KM && hasLaserLos(A.pos, B.pos);
    const okAC = dAC <= MAX_ISL_KM && hasLaserLos(A.pos, C.pos);
    const okBC = dBC <= MAX_ISL_KM && hasLaserLos(B.pos, C.pos);
    updateLink(linkAB, A.pos, B.pos, okAB, pulseT);
    updateLink(linkAC, A.pos, C.pos, okAC, pulseT + 0.33);
    updateLink(linkBC, B.pos, C.pos, okBC, pulseT + 0.66);

    function linkReason(d, a, b) {
      if (d > MAX_ISL_KM) return `далеко ${Math.round(d)} км > ${MAX_ISL_KM}`;
      if (!hasLaserLos(a, b)) return `Земля в хорде (${Math.round(d)} км)`;
      return null;
    }

    const activeLinks = [
      okAB && { name: "A↔B", d: dAB },
      okAC && { name: "A↔C", d: dAC },
      okBC && { name: "B↔C", d: dBC },
    ].filter(Boolean);
    const blocked = [
      !okAB && `A↔B: ${linkReason(dAB, A.pos, B.pos)}`,
      !okAC && `A↔C: ${linkReason(dAC, A.pos, C.pos)}`,
      !okBC && `B↔C: ${linkReason(dBC, B.pos, C.pos)}`,
    ].filter(Boolean);

    const llA = latLonFromPos(A.pos, earth.rotation.y);
    const llB = latLonFromPos(B.pos, earth.rotation.y);
    const llC = latLonFromPos(C.pos, earth.rotation.y);
    const phaseADeg = ((((uA * 180) / Math.PI) % 360) + 360) % 360;
    const phaseBDeg = ((((uB * 180) / Math.PI) % 360) + 360) % 360;
    const phaseCDeg = ((((uC * 180) / Math.PI) % 360) + 360) % 360;
    fillSatCol("a", llA.lat, llA.lon, phaseADeg, "плоскость 0°");
    fillSatCol("b", llB.lat, llB.lon, phaseBDeg, "плоскость 0° · +фаза");
    fillSatCol("c", llC.lat, llC.lon, phaseCDeg, "плоскость +10°");

    const over = overRussiaPrecise(llA.lat, llA.lon);
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
    if (elLat) elLat.textContent = `${llA.lat.toFixed(1)}°`;
    if (elLon) elLon.textContent = `${llA.lon.toFixed(1)}°`;
    if (elOver) {
      elOver.textContent = over
        ? `пролёт РФ · ${fmtMin(overAccumS / 60)} · ${fmtKm(V_ORBIT_KMS * overAccumS)}`
        : "смотрите столбцы A / B / C";
      elOver.dataset.zone = over ? "ru" : "out";
    }

    if (elLaser) {
      if (!activeLinks.length) {
        elLaser.textContent = blocked[0] || "нет линков";
        elLaser.dataset.zone = "out";
      } else {
        const parts = activeLinks.map((l) => {
          const ms = (l.d / C_KM_S) * 1000;
          return `${l.name} ${Math.round(l.d)} км (~${ms.toFixed(1)} мс)`;
        });
        elLaser.textContent = `${activeLinks.length}/3 · ${parts.join(" · ")}`;
        elLaser.dataset.zone = "ru";
      }
    }

    // Радио Земля↔КА (Камчатка): угол места ≥ MIN_ELEV_DEG к ближайшему КА
    const sats = [
      { name: "A", pos: A.pos },
      { name: "B", pos: B.pos },
      { name: "C", pos: C.pos },
    ];
    const groundActive = [];
    groundMarkers.forEach((m, idx) => {
      m.group.getWorldPosition(m.world);
      let best = null;
      for (const s of sats) {
        const elev = elevationDeg(m.world, s.pos);
        const distKm = m.world.distanceTo(s.pos) / SCALE;
        if (elev >= MIN_ELEV_DEG && (!best || elev > best.elev)) {
          best = { sat: s.name, elev, distKm, pos: s.pos };
        }
      }
      const on = !!best;
      updateRfLink(rfLinks[idx], m.world, on ? best.pos : m.world, on, pulseT + idx * 0.2);
      if (on) {
        groundActive.push(
          `${m.name}↔${best.sat} · el ${best.elev.toFixed(0)}° · ${Math.round(best.distKm)} км`
        );
      }
    });
    if (elGround) {
      if (!groundActive.length) {
        elGround.textContent = `Камчатка: нет КА выше ${MIN_ELEV_DEG}° (ждём пролёт)`;
        elGround.dataset.zone = "out";
      } else {
        elGround.textContent = groundActive.join(" · ");
        elGround.dataset.zone = "ru";
      }
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
