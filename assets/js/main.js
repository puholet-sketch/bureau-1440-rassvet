/* Бюро 1440 — интерактивная схема Рассвет. Данные встроены (работает с file://). */
(() => {
  const PARAMS = {
    ue: {
      title: "Абонентское устройство",
      sub: "Телефон / ПК в локальной сети терминала",
      rows: [
        ["Роль", "Клиент сервиса"],
        ["Канал до терминала", "Wi‑Fi / Ethernet"],
        ["Скорость сервиса (заявл.)", "до 1 Гбит/с"],
        ["Через терминал УЛЬТРА", "до 700 Мбит/с"],
      ],
    },
    ut: {
      title: "Абонентский терминал АФАР",
      sub: "1440.УЛЬТРА — фазированная решётка",
      rows: [
        ["Размер", "600 × 600 × 42 мм"],
        ["Масса", "11 кг"],
        ["Питание", "до 250 Вт"],
        ["Защита / t°", "IP67 · −40…+40 °C"],
        ["Развёртывание", "< 15 мин"],
        ["Полосы", "Ku / Ka"],
        ["Подвижность", "статика и движение; ЗЕМЛЯ до 400 км/ч"],
      ],
    },
    sat_user: {
      title: "Спутник над пользователем",
      sub: "Rassvet-3 · орбитальная 5G БС",
      rows: [
        ["Масса КА", "~370 кг"],
        ["Орбита (маркетинг)", "~800 км"],
        ["Орбита серии (трекинг)", "~510 км"],
        ["Наклонение", "~82.3°"],
        ["Скорость КА", "~7.6 км/с (~27 400 км/ч)"],
        ["Интерфейс", "5G NTN"],
        ["Задержка (заявл.)", "до ~70–100 мс"],
        ["Пятно покрытия (510 км)", "R ≈ 885 км (оценка)"],
      ],
    },
    isl: {
      title: "Лазерная межспутниковая связь",
      sub: "Оптический ISL собственной разработки",
      rows: [
        ["Скорость (квалификация)", "10 Гбит/с"],
        ["Дальность тестов", "30 … 1005 км"],
        ["BER", "< 10⁻¹¹"],
        ["Среда", "ИК-луч в вакууме"],
        ["Зачем", "mesh без густой сети шлюзов"],
        ["Серия", "терминалы «нового поколения»"],
      ],
    },
    sat_gw: {
      title: "Спутник над шлюзом",
      sub: "Тот же класс КА — выход в наземку",
      rows: [
        ["Вход", "лазерный hop от mesh"],
        ["Выход", "RF feeder (типично Ka)"],
        ["ДУ", "плазменная, криптон"],
        ["Подъём с 300→510 км", "Δv ≈ 120 м/с (оценка)"],
        ["Подъём до 800 км", "Δv ≈ 275 м/с (оценка)"],
        ["Характер тяги", "низкая тяга, недели–месяцы"],
      ],
    },
    gw: {
      title: "Шлюзовая станция + ядро",
      sub: "Связь орбиты с интернетом и операторами",
      rows: [
        ["Функция", "feeder ↔ публичные сети"],
        ["Ядро", "5G core (синергия Yadro)"],
        ["Партнёры", "МегаФон и др. операторы"],
        ["Ранний ТТ&C", "5 станций слежения по РФ"],
        ["ЦУП", "Москва — управление КА"],
      ],
    },
    ttc: {
      title: "ЦУП и станции слежения",
      sub: "Телеметрия, команды, орбита",
      rows: [
        ["ЦУП", "Бюро 1440, Москва"],
        ["Задачи", "ДУ, ориентация, здоровье КА, SSA"],
        ["Старт управления", "после отделения от РН"],
        ["Запуски", "Союз-2.1б · Плесецк / Восточный"],
      ],
    },
  };

  const STEPS = [
    { id: "ue", n: "01", title: "Устройство", detail: "Телефон/ПК → локальная сеть терминала" },
    { id: "ut", n: "02", title: "Терминал АФАР", detail: "Ku/Ka uplink, компенсация Доплера (5G NTN)" },
    { id: "sat_user", n: "03", title: "КА пользователя", detail: "Приём луча, onboard 5G обработка" },
    { id: "isl", n: "04", title: "Лазерная mesh", detail: "Оптические hops до 10 Гбит/с" },
    { id: "sat_gw", n: "05", title: "КА шлюза", detail: "Feeder downlink на Землю" },
    { id: "gw", n: "06", title: "Шлюз + интернет", detail: "Ядро сети / публичный интернет" },
    { id: "ttc", n: "07", title: "ЦУП (параллельно)", detail: "ТМИ и команды, плазменная ДУ" },
  ];

  const pathOrder = ["ue", "ut", "sat_user", "isl", "sat_gw", "gw"];

  const titleEl = document.getElementById("panel-title");
  const subEl = document.getElementById("panel-sub");
  const paramsEl = document.getElementById("param-rows");
  const stepsEl = document.getElementById("steps");
  const packet = document.getElementById("packet");
  const playBtn = document.getElementById("btn-play");

  let active = "ue";
  let playing = true;
  let hop = 0;
  let raf = 0;
  let last = 0;

  const hopDuration = 1600;

  function gloss(el) {
    if (typeof window.applyGlossary === "function" && el) window.applyGlossary(el);
  }

  function renderSteps() {
    stepsEl.innerHTML = STEPS.map(
      (s) => `
      <li>
        <button type="button" data-id="${s.id}" class="${s.id === active ? "is-active" : ""}">
          <span class="n">${s.n}</span>
          <span>
            <strong>${s.title}</strong>
            <small>${s.detail}</small>
          </span>
        </button>
      </li>`
    ).join("");
    gloss(stepsEl);
  }

  function renderParams(id) {
    const p = PARAMS[id];
    if (!p) return;
    titleEl.textContent = p.title;
    subEl.textContent = p.sub;
    paramsEl.innerHTML = p.rows
      .map(
        ([k, v]) => `
      <div class="param">
        <dt>${k}</dt>
        <dd>${v}</dd>
      </div>`
      )
      .join("");
    gloss(document.getElementById("panel"));
  }

  function setActive(id, fromUser = false) {
    active = id;
    document.querySelectorAll(".node").forEach((n) => {
      n.classList.toggle("is-active", n.dataset.id === id);
    });
    document.querySelectorAll(".steps button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.id === id);
    });
    renderParams(id);
    if (fromUser) {
      const i = pathOrder.indexOf(id);
      if (i >= 0) hop = i;
    }
  }

  function placePacket(id, t) {
    const a = document.getElementById(`pt-${id}`);
    const nextId = pathOrder[(pathOrder.indexOf(id) + 1) % pathOrder.length];
    const b = document.getElementById(`pt-${nextId}`);
    if (!a || !b || !packet) return;
    const x1 = +a.getAttribute("cx");
    const y1 = +a.getAttribute("cy");
    const x2 = +b.getAttribute("cx");
    const y2 = +b.getAttribute("cy");
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    packet.setAttribute("cx", x);
    packet.setAttribute("cy", y);
    const laserHop = id === "sat_user" || id === "isl";
    packet.classList.toggle("packet--laser", laserHop);
  }

  function tick(ts) {
    if (!playing) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (!last) last = ts;
    const dt = ts - last;
    const t = Math.min(1, dt / hopDuration);
    const id = pathOrder[hop];
    placePacket(id, t);
    if (t >= 1) {
      last = ts;
      hop = (hop + 1) % pathOrder.length;
      setActive(pathOrder[hop]);
    }
    raf = requestAnimationFrame(tick);
  }

  stepsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    setActive(btn.dataset.id, true);
  });

  document.querySelectorAll(".node").forEach((n) => {
    n.addEventListener("click", () => setActive(n.dataset.id, true));
    n.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(n.dataset.id, true);
      }
    });
  });

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Пауза анимации" : "Запуск анимации";
    playBtn.classList.toggle("is-paused", !playing);
    if (playing) last = 0;
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    playing = false;
    playBtn.textContent = "Запуск анимации";
  }

  renderSteps();
  setActive("ue");
  placePacket("ue", 0);
  raf = requestAnimationFrame(tick);
})();
