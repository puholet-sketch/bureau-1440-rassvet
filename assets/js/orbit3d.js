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
  let MAX_ISL_KM = 1005; // тест Бюро: до ~1005 км (обновится из constellation.json)

  const PERIOD_REAL_S = 2 * Math.PI * Math.sqrt(Math.pow(ORBIT_R_KM * 1000, 3) / 3.986e14);
  const PERIOD_VIS_S = 28;
  const V_ORBIT_KMS = Math.sqrt(3.986e5 / ORBIT_R_KM);
  const ORBIT_LEN_KM = 2 * Math.PI * ORBIT_R_KM;
  const C_KM_S = 299792.458;

  let playing = true;
  let timeScale = 1;
  // Старт: КА-A над Камчаткой (подобрано под geoToLocal / текстуру)
  let meanAnomaly = (54 * Math.PI) / 180;
  let last = performance.now();
  let russiaPolys = null;
  let pulseT = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.FogExp2(0x070a10, 0.012);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 120);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = EARTH_R * 2.05;
  controls.maxDistance = EARTH_R * 7.5;
  controls.target.set(0, 0, 0);

  /**
   * Гео → XYZ на сфере Three.js (совпадает с equirect UV текстуры).
   * lon=-180…180: Камчатка ≈158°E — восточный край РФ, не Калининград.
   */
  function geoToLocal(latDeg, lonDeg, radius) {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    return new THREE.Vector3(
      radius * Math.cos(lat) * Math.cos(lon),
      radius * Math.sin(lat),
      -radius * Math.cos(lat) * Math.sin(lon)
    );
  }

  function applyEarthSpin(local, earthRotY) {
    return local.clone().applyAxisAngle(_yUp, earthRotY);
  }

  /** Шар заполняет кадр; Камчатка / восток РФ к камере */
  function frameFullEarth(earthRotY) {
    const cam = applyEarthSpin(geoToLocal(54, 162, EARTH_R * 2.55), earthRotY);
    camera.position.copy(cam);
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
    // world → earth-local (обратный Ry), затем lon = atan2(-z, x) как у geoToLocal
    const c = Math.cos(earthRotY);
    const s = Math.sin(earthRotY);
    const x = c * p.x - s * p.z;
    const y = p.y;
    const z = s * p.x + c * p.z;
    const r = Math.hypot(x, y, z) || 1;
    const lat = (Math.asin(THREE.MathUtils.clamp(y / r, -1, 1)) * 180) / Math.PI;
    const lon = (Math.atan2(-z, x) * 180) / Math.PI;
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
  earth.rotation.y = 0;
  scene.add(earth);
  frameFullEarth(earth.rotation.y);

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

  // Камчатка (восток РФ): разнесены на ~200–400 км — в одном пятне LEO, но не в одной точке
  const GROUND_SITES = [
    {
      id: "gw",
      name: "Шлюз",
      full: "Шлюз · Петропавловск-Камчатский",
      lat: 53.02,
      lon: 158.65,
      color: 0xe02020,
      role: "gateway",
    },
    {
      id: "term",
      name: "Терминал",
      full: "Терминал · Усть-Камчатск",
      lat: 56.23,
      lon: 162.48,
      color: 0x5ce1ff,
      role: "terminal",
    },
    {
      id: "bs",
      name: "БС 5G",
      full: "БС · запад Камчатки",
      lat: 54.35,
      lon: 155.95,
      color: 0xffb020,
      role: "bs",
    },
  ];

  const groundGroup = new THREE.Group();
  earth.add(groundGroup);
  const groundMarkers = GROUND_SITES.map((site) => {
    const g = new THREE.Group();
    const pos = geoToLocal(site.lat, site.lon, EARTH_R * 1.004);
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
  const BASE_RAAN = (169 * Math.PI) / 180; // плоскость над Камчаткой
  const orbitLines = [];
  function clearOrbitLines() {
    while (orbitLines.length) {
      const L = orbitLines.pop();
      scene.remove(L);
      L.geometry.dispose();
      L.material.dispose();
    }
  }
  function setOrbitPlanes(raans) {
    clearOrbitLines();
    raans.forEach((raan, i) => orbitLines.push(addOrbitLine(raan, i === 0 ? 0.7 : 0.35)));
  }

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

  function makeFleetDot(color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    scene.add(m);
    return m;
  }

  const footMat = new THREE.MeshBasicMaterial({
    color: 0xffb020,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const footA = new THREE.Mesh(new THREE.CircleGeometry(EARTH_R * 0.2, 40), footMat);
  scene.add(footA);

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

  function makeLaserLink() {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe02020,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    scene.add(tube);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    scene.add(glow);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
    );
    scene.add(pulse);
    const pulse2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8080, transparent: true, opacity: 0.95 })
    );
    scene.add(pulse2);
    return { tube, glow, pulse, pulse2 };
  }

  let constellation = null;
  let fleetMode = "now"; // now | demo | target
  let fleet = []; // { mesh, raan, mean0, plane, slot, detailed? }
  let laserPool = [];
  const planeColors = [0xe02020, 0x5ce1ff, 0xffb020, 0xb0ff7a, 0xff80c0, 0xa090ff];

  function ensureLaserPool(n) {
    while (laserPool.length < n) laserPool.push(makeLaserLink());
    for (let i = n; i < laserPool.length; i++) {
      laserPool[i].tube.visible = false;
      laserPool[i].glow.visible = false;
      laserPool[i].pulse.visible = false;
      laserPool[i].pulse2.visible = false;
    }
  }

  function clearFleetMeshes() {
    fleet.forEach((s) => {
      scene.remove(s.mesh);
      s.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    });
    fleet = [];
  }

  function buildFleet(mode) {
    clearFleetMeshes();
    const base = constellation || {
      current: { model: { planes: 3, per_plane: 10, odd_plane_phase_offset: true }, active_approx: 31 },
      target_company: { model: { planes: 12, per_plane: 21, odd_plane_phase_offset: true }, active_approx: 252 },
    };

    if (mode === "demo") {
      setOrbitPlanes([BASE_RAAN, BASE_RAAN + (10 * Math.PI) / 180]);
      fleet = [
        { mesh: makeSat(0xe02020, 1.15), raan: BASE_RAAN, mean0: 0, plane: 0, slot: 0, id: "A", detailed: true },
        {
          mesh: makeSat(0x5ce1ff, 1),
          raan: BASE_RAAN,
          mean0: (8 * Math.PI) / 180,
          plane: 0,
          slot: 1,
          id: "B",
          detailed: true,
        },
        {
          mesh: makeSat(0xffb020, 1),
          raan: BASE_RAAN + (10 * Math.PI) / 180,
          mean0: (5 * Math.PI) / 180,
          plane: 1,
          slot: 0,
          id: "C",
          detailed: true,
        },
      ];
      ensureLaserPool(3);
      return;
    }

    const cfg = mode === "target" ? base.target_company.model : base.current.model;
    const planes = cfg.planes;
    const per = cfg.per_plane;
    const showN = mode === "target" ? Math.min(planes * per, 84) : planes * per;
    const raans = [];
    for (let p = 0; p < planes; p++) raans.push(BASE_RAAN + (p / planes) * Math.PI * 2);
    setOrbitPlanes(mode === "target" ? raans.filter((_, i) => i % 2 === 0) : raans);

    let n = 0;
    for (let p = 0; p < planes && n < showN; p++) {
      for (let k = 0; k < per && n < showN; k++) {
        const mean0 =
          (k / per) * Math.PI * 2 + (cfg.odd_plane_phase_offset && p % 2 ? Math.PI / per : 0);
        const detailed = p === 0 && k < 3;
        const mesh = detailed
          ? makeSat(planeColors[p % planeColors.length], k === 0 ? 1.1 : 0.85)
          : makeFleetDot(planeColors[p % planeColors.length]);
        fleet.push({
          mesh,
          raan: raans[p],
          mean0,
          plane: p,
          slot: k,
          id: `P${p}-${k}`,
          detailed,
        });
        n++;
      }
    }
    // ISL: сосед по плоскости + один межплоскостной на слот
    ensureLaserPool(Math.min(showN + planes, 60));
  }

  const elFleetCount = document.getElementById("o3-fleet-count");
  const elFleetModel = document.getElementById("o3-fleet-model");
  const demoGrid = document.getElementById("o3-demo-grid");
  const fleetPanel = document.getElementById("o3-fleet-panel");

  function applyMode(mode) {
    fleetMode = mode;
    buildFleet(mode);
    document.querySelectorAll("[data-o3-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-o3-mode") === mode);
    });
    if (demoGrid) demoGrid.hidden = mode !== "demo";
    if (fleetPanel) fleetPanel.hidden = mode === "demo";
    if (elFleetCount && constellation) {
      const n =
        mode === "demo"
          ? 3
          : mode === "target"
            ? constellation.target_company.active_approx
            : constellation.current.active_approx;
      const shown = fleet.length;
      elFleetCount.textContent =
        mode === "demo" ? "3 (учебные)" : `~${n} (в кадре ${shown})`;
    }
    if (elFleetModel && constellation) {
      const m =
        mode === "demo"
          ? "соседи для ISL"
          : mode === "target"
            ? `${constellation.target_company.model.planes} пл. × ${constellation.target_company.model.per_plane} КА`
            : `${constellation.current.model.planes} пл. × ${constellation.current.model.per_plane} КА · ΔRAAN ${constellation.current.model.raan_step_deg}° · Δфаза ${constellation.current.model.phase_step_deg}°`;
      elFleetModel.textContent = m;
    }
  }

  buildFleet("now");
  document.querySelectorAll("[data-o3-mode]").forEach((btn) => {
    btn.addEventListener("click", () => applyMode(btn.getAttribute("data-o3-mode")));
  });

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

  function placeFleetSat(s, u) {
    const pos = satPosition(u, s.raan);
    const vel = satVelocity(u, s.raan);
    s.mesh.position.copy(pos);
    if (s.detailed) {
      s.mesh.lookAt(pos.clone().add(vel));
      s.mesh.up.copy(pos.clone().normalize());
    }
    return { pos, vel, sat: s };
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
    link.tube.scale.set(active ? 1 : 0.45, len, active ? 1 : 0.45);
    link.glow.scale.set(active ? 1 : 0.4, len, active ? 1 : 0.4);
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
      earth.rotation.y += 0.002 * dt * timeScale;
      pulseT += dt * timeScale * 0.55;
    }

    const placed = fleet.map((s) => placeFleetSat(s, meanAnomaly + s.mean0));
    const primary = placed.find((p) => p.sat.detailed) || placed[0];
    if (primary) {
      const nadir = primary.pos.clone().normalize().multiplyScalar(EARTH_R * 1.002);
      footA.position.copy(nadir);
      footA.lookAt(0, 0, 0);
      beamA.geometry.setFromPoints([primary.pos, nadir]);
      const gravDir = primary.pos.clone().normalize().negate();
      arrowG.position.copy(primary.pos);
      arrowG.setDirection(gravDir);
      arrowG.setLength(0.55, 0.1, 0.06);
      arrowV.position.copy(primary.pos);
      arrowV.setDirection(primary.vel);
      arrowV.setLength(0.5, 0.1, 0.06);
      arrowD.position.copy(primary.pos);
      arrowD.setDirection(primary.vel.clone().negate());
      arrowD.setLength(0.22, 0.07, 0.04);
    }

    // ISL: сосед по плоскости (+ следующий слот); в demo — все пары detailed
    const pairKeys = new Set();
    const pairs = [];
    function addPair(i, j) {
      if (i === j) return;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (pairKeys.has(key)) return;
      pairKeys.add(key);
      pairs.push([a, b]);
    }
    if (fleetMode === "demo") {
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) addPair(i, j);
    } else {
      const byPlane = new Map();
      placed.forEach((p, idx) => {
        const list = byPlane.get(p.sat.plane) || [];
        list.push(idx);
        byPlane.set(p.sat.plane, list);
      });
      byPlane.forEach((idxs) => {
        idxs.sort((a, b) => fleet[a].slot - fleet[b].slot);
        for (let t = 0; t < idxs.length; t++) addPair(idxs[t], idxs[(t + 1) % idxs.length]);
      });
      // редкий межплоскостной: тот же slot
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          if (fleet[i].plane + 1 === fleet[j].plane && fleet[i].slot === fleet[j].slot) addPair(i, j);
        }
      }
    }

    let linkOn = 0;
    let linkSample = "";
    ensureLaserPool(pairs.length);
    pairs.forEach(([i, j], n) => {
      const a = placed[i].pos;
      const b = placed[j].pos;
      const d = a.distanceTo(b) / SCALE;
      const ok = d <= MAX_ISL_KM && hasLaserLos(a, b);
      updateLink(laserPool[n], a, b, ok, pulseT + n * 0.07);
      if (ok) {
        linkOn++;
        if (!linkSample) linkSample = `${fleet[i].id}↔${fleet[j].id} ${Math.round(d)} км`;
      }
    });

    if (fleetMode === "demo" && placed.length >= 3) {
      const ids = ["a", "b", "c"];
      placed.forEach((p, idx) => {
        if (idx > 2) return;
        const ll = latLonFromPos(p.pos, earth.rotation.y);
        const u = meanAnomaly + p.sat.mean0;
        const phaseDeg = ((((u * 180) / Math.PI) % 360) + 360) % 360;
        const raanDeg = Math.round((((p.sat.raan * 180) / Math.PI) % 360) + 360) % 360;
        fillSatCol(ids[idx], ll.lat, ll.lon, phaseDeg, `RAAN ${raanDeg}°`);
      });
    }

    const llP = primary ? latLonFromPos(primary.pos, earth.rotation.y) : { lat: 0, lon: 0 };
    const over = primary && overRussiaPrecise(llP.lat, llP.lon);
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
    if (elOver) {
      elOver.textContent = over
        ? `ведущий над РФ · ${fmtMin(overAccumS / 60)}`
        : `в кадре ${fleet.length} КА · режим ${fleetMode}`;
      elOver.dataset.zone = over ? "ru" : "out";
    }

    if (elLaser) {
      if (!linkOn) {
        elLaser.textContent = `0 ISL из ${pairs.length} кандидатов (дальность≤${MAX_ISL_KM} км + LOS)`;
        elLaser.dataset.zone = "out";
      } else {
        elLaser.textContent = `${linkOn}/${pairs.length} ISL · напр. ${linkSample}`;
        elLaser.dataset.zone = "ru";
      }
    }

    const groundActive = [];
    groundMarkers.forEach((m, idx) => {
      m.group.getWorldPosition(m.world);
      let best = null;
      placed.forEach((p) => {
        const elev = elevationDeg(m.world, p.pos);
        const distKm = m.world.distanceTo(p.pos) / SCALE;
        if (elev >= MIN_ELEV_DEG && (!best || elev > best.elev)) {
          best = { sat: p.sat.id, elev, distKm, pos: p.pos };
        }
      });
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

  fetch(new URL("../data/constellation.json", import.meta.url))
    .then((r) => r.json())
    .then((data) => {
      constellation = data;
      if (data.isl && data.isl.range_tested_km) MAX_ISL_KM = data.isl.range_tested_km.max;
      const card = document.getElementById("o3-constellation-card");
      if (card) {
        const c = data.current;
        const t = data.target_company;
        const g = data.gov_plan;
        const o = data.orbit;
        card.innerHTML = `
          <h3 class="o3-constel-title">Группировка «Рассвет» · факты</h3>
          <p class="o3-constel-asof">сводка на ${data.as_of}</p>
          <table class="o3-constel-table">
            <thead><tr><th></th><th>Сейчас</th><th>Цель компании</th><th>Госплан</th></tr></thead>
            <tbody>
              <tr><th>Активных КА</th><td>~${c.active_approx}</td><td>~${t.active_approx}</td><td>${g.active}</td></tr>
              <tr><th>Модель плоскостей</th><td>${c.model.planes} × ${c.model.per_plane}</td><td>${t.model.planes} × ${t.model.per_plane}</td><td>—</td></tr>
              <tr><th>Шаг RAAN</th><td>~${c.model.raan_step_deg}°</td><td>~${t.model.raan_step_deg}°</td><td>—</td></tr>
              <tr><th>Шаг фазы</th><td>~${c.model.phase_step_deg}°</td><td>~${t.model.phase_step_deg.toFixed(1)}°</td><td>—</td></tr>
            </tbody>
          </table>
          <p><strong>Орбита серии:</strong> h≈${o.alt_working_km}&nbsp;км (маркетинг ${o.alt_marketing_km}),
            i≈${o.inclination_deg}°, период ~${o.period_min}&nbsp;мин, v≈${o.speed_km_s}&nbsp;км/с.
            ISL: тесты ${data.isl.range_tested_km.min}–${data.isl.range_tested_km.max}&nbsp;км @ ${data.isl.rate_gbps_qualified}&nbsp;Гбит/с.</p>
          <p class="note">${data.disclaimer}</p>
        `;
        if (typeof window.applyGlossary === "function") window.applyGlossary(card);
      }
      applyMode(fleetMode);
    })
    .catch(() => applyMode(fleetMode));

  requestAnimationFrame(frame);
})();
