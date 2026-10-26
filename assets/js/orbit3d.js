/* 3D орбита: один КА «Рассвет» · Земля · РФ · силы · высота
   Стек как в статье (Three.js); без React — сайт на GitHub Pages. */
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
  const playBtn = document.getElementById("o3-play");
  const slowBtn = document.getElementById("o3-slow");

  const EARTH_R_KM = 6371;
  const ALT_KM = 510;
  const ORBIT_R_KM = EARTH_R_KM + ALT_KM;
  const INC_DEG = 82.3;
  const SCALE = 1 / 1000; // 1 unit ≈ 1000 km
  const EARTH_R = EARTH_R_KM * SCALE;
  const ORBIT_R = ORBIT_R_KM * SCALE;

  // Визуальное ускорение: полный виток ~28 с экранного времени
  const PERIOD_REAL_S = 2 * Math.PI * Math.sqrt(Math.pow(ORBIT_R_KM * 1000, 3) / 3.986e14);
  const PERIOD_VIS_S = 28;
  const V_ORBIT_KMS = Math.sqrt(3.986e5 / ORBIT_R_KM); // ≈ 7.6

  let playing = true;
  let timeScale = 1;
  let meanAnomaly = 0.35;
  let last = performance.now();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.FogExp2(0x070a10, 0.045);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 80);
  camera.position.set(4.2, 2.1, 3.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 12;
  controls.target.set(0, 0, 0);

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
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, sizeAttenuation: true, opacity: 0.7, transparent: true })));
  }

  function makeEarthTexture() {
    const w = 2048;
    const h = 1024;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1c28");
    g.addColorStop(0.45, "#123348");
    g.addColorStop(0.55, "#1a4a3a");
    g.addColorStop(1, "#0b1c28");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Простые «континенты» шумом
    ctx.fillStyle = "rgba(45, 90, 55, 0.55)";
    for (let i = 0; i < 180; i++) {
      const x = (Math.sin(i * 12.1) * 0.5 + 0.5) * w;
      const y = (Math.cos(i * 7.7) * 0.5 + 0.5) * h;
      const rx = 20 + (i % 40);
      const ry = 12 + (i % 25);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, i, 0, Math.PI * 2);
      ctx.fill();
    }

    // Сетка
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
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

    // Россия (упрощённый контур lat/lon → equirect)
    const RU = [
      [70, 30], [69, 45], [70, 60], [72, 80], [75, 100], [73, 130], [71, 160],
      [68, 180], [65, 175], [60, 165], [55, 150], [50, 140], [48, 135],
      [45, 50], [50, 40], [55, 35], [62, 30], [68, 28],
    ];
    function ll(lat, lon) {
      return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
    }
    ctx.beginPath();
    RU.forEach(([lat, lon], i) => {
      const [x, y] = ll(lat, lon);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(224, 32, 32, 0.55)";
    ctx.fill();
    ctx.strokeStyle = "#fb5a5a";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Подпись Россия
    const [rx, ry] = ll(60, 90);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px Onest, sans-serif";
    ctx.fillText("РОССИЯ", rx - 70, ry);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  const earthMat = new THREE.MeshStandardMaterial({
    map: makeEarthTexture(),
    roughness: 0.85,
    metalness: 0.05,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), earthMat);
  // Three.js: +Y up; текстура: вращение чтобы ~95°E смотрела к камере в начале
  earth.rotation.y = Math.PI * 0.45;
  scene.add(earth);

  // Атмосфера
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.035, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.07, side: THREE.BackSide })
  );
  scene.add(atmo);

  // Орбита (наклон i≈82.3°)
  const orbitCurve = (() => {
    const pts = [];
    const i = (INC_DEG * Math.PI) / 180;
    for (let k = 0; k <= 256; k++) {
      const u = (k / 256) * Math.PI * 2;
      const x = ORBIT_R * Math.cos(u);
      const y = ORBIT_R * Math.sin(u) * Math.sin(i);
      const z = ORBIT_R * Math.sin(u) * Math.cos(i);
      pts.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  })();

  const orbitLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitCurve.getPoints(256)),
    new THREE.LineDashedMaterial({ color: 0x5ce1ff, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.75 })
  );
  orbitLine.computeLineDistances();
  scene.add(orbitLine);

  // Спутник
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

  // Пятно покрытия (диск на поверхности)
  const foot = new THREE.Mesh(
    new THREE.CircleGeometry(EARTH_R * 0.22, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  scene.add(foot);

  // Луч к Земле (надир)
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.55 }));
  scene.add(beam);

  // Стрелки сил
  function makeArrow(color) {
    const dir = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3();
    return new THREE.ArrowHelper(dir, origin, 0.45, color, 0.1, 0.06);
  }
  const arrowG = makeArrow(0xe02020); // тяготение
  const arrowV = makeArrow(0x5ce1ff); // скорость
  const arrowD = makeArrow(0xffb020); // drag
  scene.add(arrowG, arrowV, arrowD);

  function satPosition(u) {
    const i = (INC_DEG * Math.PI) / 180;
    const x = ORBIT_R * Math.cos(u);
    const y = ORBIT_R * Math.sin(u) * Math.sin(i);
    const z = ORBIT_R * Math.sin(u) * Math.cos(i);
    return new THREE.Vector3(x, y, z);
  }

  function satVelocity(u) {
    const i = (INC_DEG * Math.PI) / 180;
    // d/du
    const dx = -ORBIT_R * Math.sin(u);
    const dy = ORBIT_R * Math.cos(u) * Math.sin(i);
    const dz = ORBIT_R * Math.cos(u) * Math.cos(i);
    return new THREE.Vector3(dx, dy, dz).normalize();
  }

  function latLonFromPos(p) {
    // учёт вращения текстуры earth.rotation.y
    const q = p.clone().normalize();
    const lat = (Math.asin(q.y) * 180) / Math.PI;
    let lon = (Math.atan2(q.x, q.z) * 180) / Math.PI;
    lon = ((lon - (earth.rotation.y * 180) / Math.PI + 540) % 360) - 180;
    return { lat, lon };
  }

  function overRussia(lat, lon) {
    return lat > 42 && lat < 78 && lon > 28 && lon < 180;
  }

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
      slowBtn.textContent = timeScale === 1 ? "Скорость ×1" : timeScale < 1 ? "Скорость ×0.35" : "Скорость ×2.2";
    });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      meanAnomaly += ((Math.PI * 2) / PERIOD_VIS_S) * dt * timeScale;
      earth.rotation.y += 0.015 * dt * timeScale; // слабое вращение Земли для живости
    }

    const pos = satPosition(meanAnomaly);
    const vel = satVelocity(meanAnomaly);
    satGroup.position.copy(pos);
    satGroup.lookAt(pos.clone().add(vel));
    satGroup.up.copy(pos.clone().normalize());

    // Надир / пятно
    const nadir = pos.clone().normalize().multiplyScalar(EARTH_R * 1.002);
    foot.position.copy(nadir);
    foot.lookAt(0, 0, 0);
    beam.geometry.setFromPoints([pos, nadir]);

    // Силы
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

    const { lat, lon } = latLonFromPos(pos);
    if (elAlt) elAlt.textContent = `~${ALT_KM} км`;
    if (elSpeed) elSpeed.textContent = `~${V_ORBIT_KMS.toFixed(1)} км/с`;
    if (elLat) elLat.textContent = `${lat.toFixed(1)}°`;
    if (elLon) elLon.textContent = `${lon.toFixed(1)}°`;
    if (elPeriod) elPeriod.textContent = `~${Math.round(PERIOD_REAL_S / 60)} мин`;
    if (elOver) {
      elOver.textContent = overRussia(lat, lon)
        ? "сейчас над Россией / у границы"
        : lat > 70
          ? "Арктика / высокие широты"
          : Math.abs(lat) < 25
            ? "низкие широты / у экватора"
            : "вне РФ (океан / другая страна)";
      elOver.dataset.zone = overRussia(lat, lon) ? "ru" : "out";
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
