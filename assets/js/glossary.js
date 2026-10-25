/* Глоссарий и всплывающие подсказки по терминам */
(() => {
  const TERMS = [
    { keys: ["5G NTN"], def: "Non-Terrestrial Network — стандарт 5G для связи через спутники (не только наземные БС)." },
    { keys: ["station-keeping", "Station-keeping"], def: "Удержание рабочей орбиты малыми импульсами ДУ против drag и возмущений." },
    { keys: ["handover", "Handover"], def: "Передача сессии с одного спутника/луча на следующий, когда первый уходит за горизонт." },
    { keys: ["TT&C", "ТТ&C"], def: "Tracking, Telemetry & Command — сопровождение, телеметрия и команды управления КА." },
    { keys: ["delta-v", "Δv", "ΔV"], def: "Изменение скорости, нужное для манёвра (подъём орбиты, удержание, сход)." },
    { keys: ["mesh", "Mesh", "MESH"], def: "Сетка связей между спутниками: данные прыгают по лазеру от КА к КА, пока не дойдут до шлюза." },
    {
      keys: ["Ka feeder"],
      def: "Фидер в диапазоне Ka: широкий радиоканал спутника со шлюзом на Земле (интернет/ядро сети), не путать с лучом к абоненту.",
    },
    {
      keys: ["Ku/Ka"],
      def: "Два радиодиапазона: Ku (~12–18 ГГц) — чаще к абоненту; Ka (~26–40 ГГц) — шире полоса, часто feeder к шлюзу.",
    },
    {
      keys: ["feeder", "Feeder"],
      def: "Feeder (фидер) — «магистраль» спутник↔шлюз. Отдельно от user-link к телефону/терминалу.",
    },
    { keys: ["NTN"], def: "Non-Terrestrial Network — «неземная» сеть 5G: спутники вместо (или вместе с) наземных БС." },
    { keys: ["ISL"], def: "Inter-Satellite Link — межспутниковая связь (здесь — лазерная, до 10 Гбит/с)." },
    { keys: ["АФАР"], def: "Активная фазированная антенная решётка: плоская антенна, луч наводится электроникой." },
    { keys: ["LEO"], def: "Low Earth Orbit — низкая околоземная орбита (~160–2000 км). У Рассвета ~510–800 км." },
    { keys: ["MEO"], def: "Medium Earth Orbit — средняя орбита (навигация GPS/ГЛОНАСС и т.п.)." },
    { keys: ["GEO"], def: "Geostationary Orbit (~35 786 км): спутник «висит» над точкой экватора; пинг больше, чем у LEO." },
    { keys: ["HEO"], def: "Highly Elliptical Orbit — высокоэллиптическая орбита (не путать с GEO)." },
    { keys: ["ЦУП"], def: "Центр управления полётами — отсюда ведут КА: команды, телеметрия, манёвры." },
    { keys: ["ТМИ"], def: "Телеметрическая информация — данные о состоянии спутника на Землю." },
    { keys: ["SSA"], def: "Space Situational Awareness — не одна «система», а контроль орбиты: каталог объектов, прогноз сближений с мусором/КА и манёвры уклонения (у Бюро — conjunctions@1440.space)." },
    { keys: ["GNSS"], def: "Навигация GPS/ГЛОНАСС… — позиция и компенсация Доплера в 5G NTN." },
    { keys: ["BER"], def: "Bit Error Rate — доля битовых ошибок на канале." },
    { keys: ["R&D"], def: "Research & Development — исследования и разработка." },
    { keys: ["CAD"], def: "САПР / цифровая модель конструкции и систем." },
    { keys: ["B2B"], def: "Услуги для бизнеса (операторы, добыча, транспорт)." },
    { keys: ["B2G"], def: "Услуги для государства и госсектора." },
    {
      keys: ["equity", "Equity", "НЕ equity", "Не equity", "не equity"],
      def: "Equity — доля собственности в компании (капитал владельцев). «Не equity» = партнёр/бюджет/подрядчик без доли в ООО, прибыли по долям не получает.",
    },
    {
      keys: ["P&L", "P&amp;L"],
      def: "Profit & Loss — отчёт о прибылях и убытках: выручка минус расходы = прибыль (или убыток).",
    },
    {
      keys: ["Уставный капитал", "уставный капитал"],
      def: "Сумма вкладов учредителей, зафиксированная в уставе ООО. Не равна стоимости компании и не равна активам.",
    },
    {
      keys: ["Дивиденды", "дивиденды"],
      def: "Выплата прибыли участникам. У Бюро 1440 в 2024 — 0 ₽ (инвестфаза, убыток).",
    },
    {
      keys: ["Активы", "активы"],
      def: "Всё, чем владеет компания (деньги, оборудование, незавершённое производство, права) — строка баланса.",
    },
    {
      keys: ["Капитал", "капитал"],
      def: "Здесь — собственный капитал в балансе (активы минус обязательства), не путать с уставным капиталом.",
    },
    {
      keys: ["Чистая прибыль", "чистая прибыль"],
      def: "Прибыль после всех расходов и налогов. Отрицательная = убыток за год.",
    },
    {
      keys: ["X Holding", "ИКС Холдинг", "ИКС"],
      def: "ИКС Холдинг (X Holding): техгруппа (Yadro, Цитадель, Гарда, Криптонит, Бюро 1440…). Основатель А. Черепенников (до 2023); сейчас — управляющие партнёры, имена акционеров скрыты.",
    },
    {
      keys: ["ЗПИФ «Олимп-М»", "ЗПИФ", "Олимп-М"],
      def: "Закрытый паевой инвестиционный фонд. Через УК Mercury (~33% Бюро 1440 по СПАРК); кто пайщики — публично не раскрыто.",
    },
    {
      keys: ["Mercury", "Меркури"],
      def: "Меркури Кэпитал Траст — УК, через которую в реестре фигурировал ЗПИФ «Олимп-М» (~33% Бюро 1440).",
    },
    {
      keys: ["Черепенников", "Антон Черепенников"],
      def: "Антон Черепенников (1982–2023) — основатель и бывший 100% бенефициар ИКС Холдинга.",
    },
    {
      keys: ["реконстр.", "реконструкция"],
      def: "Оценка долей по открытой прессе/исследованиям, не актуальная выписка ЕГРЮЛ (реестр с 2022 скрыт).",
    },
    { keys: ["Isp"], def: "Удельный импульс — экономичность двигателя: выше Isp → меньше топлива на ту же Δv." },
    { keys: ["drag", "Drag"], def: "Атмосферное торможение на LEO: газ замедляет КА и снижает орбиту." },
    { keys: ["RF"], def: "Radio Frequency — радиоканал (user-link / feeder), не лазер." },
    { keys: ["Ku"], def: "Ku-диапазон (~12–18 ГГц) — классика спутникового ТВ/интернета; у Рассвета часто user-link к терминалу." },
    { keys: ["Ka"], def: "Ka-диапазон (~26–40 ГГц) — выше частоты, больше скорость; типичен для feeder к шлюзу и высоких скоростей." },
    {
      keys: ["АФАР user", "user-link"],
      def: "User-link — радиолуч к абоненту (терминал АФАР / сервис). Не путать с feeder к шлюзу.",
    },
    { keys: ["Kr"], def: "Криптон — рабочее тело плазменного двигателя (по открытым сводкам)." },
    { keys: ["СПД"], def: "Стационарный плазменный двигатель (эффект Холла): малая тяга, высокий Isp." },
    { keys: ["ЭРД"], def: "Электроракетный двигатель — электрические ДУ (плазма, ионные…)." },
    { keys: ["ШПД"], def: "Широкополосный доступ — быстрый интернет." },
    { keys: ["ВОЛС"], def: "Волоконно-оптическая линия связи по земле." },
    { keys: ["СЭС"], def: "Система электроснабжения КА: солнечные батареи + аккумуляторы." },
    {
      keys: ["ориентация", "ориентации"],
      def: "Удержание нужного положения КА: антенны к Земле/соседу, СБ к Солнцу (реакционные колёса, датчики, иногда ДУ).",
    },
    {
      keys: ["плазменная ДУ", "плазменной ДУ", "плазменным двигателем"],
      def: "Электроракетный двигатель на эффекте Холла: малая тяга, высокий Isp — подъём орбиты и station-keeping.",
    },
    {
      keys: ["лазер ISL", "лазерной ISL", "лазерная ISL"],
      def: "Оптическая межспутниковая связь (ISL) до 10 Гбит/с — hops mesh без густой сети шлюзов.",
    },
    {
      keys: ["Южно-Атлантическая аномалия", "Южно-Атлантической аномалии"],
      def: "Участок над Южной Атлантикой, где радиационный пояс ближе к Земле: на LEO выше доза — больше сбоев электроники и нагрузка на СБ.",
    },
    {
      keys: ["пояса Ван Аллена", "поясов Ван Аллена", "Ван Аллена"],
      def: "Радиационные пояса Земли: зоны заряженных частиц в магнитном поле. На LEO КА задевают их краями; сильнее бьют по электронике и СБ.",
    },
    {
      keys: ["деградация СБ", "деградацию СБ"],
      def: "Постепенная потеря мощности солнечных батарей из‑за радиации, атомарного кислорода и циклов свет/тень.",
    },
    { keys: ["СБ"], def: "Солнечные батареи — панели, которые питают КА (часть СЭС)." },
    {
      keys: ["департамента", "департамент", "деп."],
      def: "Подразделение компании. Например, департамент ДУ — команда двигательных установок (руководитель Яна Харлан).",
    },
    { keys: ["КА"], def: "Космический аппарат — спутник группировки «Рассвет»." },
    { keys: ["ДУ"], def: "Двигательная установка — плазменный двигатель для подъёма и удержания орбиты." },
    { keys: ["БС"], def: "Базовая станция. У Рассвета спутник работает как орбитальная 5G БС." },
    { keys: ["ПН"], def: "Полезная нагрузка — оборудование связи на борту." },
    { keys: ["гс"], def: "Грамм-сила (~0,01 Н). Тяга плазменных ДУ — порядка нескольких гс." },
    { keys: ["Доплер", "доплер"], def: "Сдвиг частоты из‑за движения КА; в 5G NTN его компенсируют заранее." },
    { keys: ["пинг", "пингом", "Пинг"], def: "Задержка туда-обратно (RTT). У LEO — десятки мс, у GEO — заметно больше." },
    { keys: ["группировка", "группировки", "группировке", "группировку"], def: "Созвездие спутников на орбите как одна сеть покрытия." },
    {
      keys: ["шлюзовая", "шлюзовой", "шлюзовую", "шлюзовые", "шлюзом", "шлюзы", "шлюз"],
      def: "Наземная станция: связывает орбитальную сеть с интернетом и ядром оператора.",
    },
    {
      keys: ["регенеративный", "регенеративная", "регенерацию", "регенерация"],
      def: "Спутник не «зеркало»: принимает, обрабатывает (5G) и передаёт дальше — орбитальная БС.",
    },
  ];

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "PATH", "CIRCLE", "RECT", "LINE", "ELLIPSE", "DEFS", "STOP", "G", "TITLE", "DESC", "TEXT", "TSPAN"]);

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isWordish(ch) {
    return ch && /[A-Za-zА-Яа-яЁё0-9_]/.test(ch);
  }

  const patterns = TERMS.flatMap((t) =>
    t.keys.map((k) => ({
      key: k,
      def: t.def,
      re: new RegExp(escapeRe(k), k.length <= 3 && /^[A-Za-zА-Яа-яЁё]+$/.test(k) ? "g" : "gi"),
    }))
  ).sort((a, b) => b.key.length - a.key.length);

  function wrapTextNode(node) {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;

    let best = null;
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const start = m.index;
        const end = start + m[0].length;
        const before = text[start - 1];
        const after = text[end];
        if (isWordish(before) || isWordish(after)) continue;
        if (!best || start < best.start || (start === best.start && m[0].length > best.len)) {
          best = { start, end, len: m[0].length, def: p.def, match: m[0] };
        }
        break;
      }
    }
    if (!best) return;

    const frag = document.createDocumentFragment();
    if (best.start > 0) frag.appendChild(document.createTextNode(text.slice(0, best.start)));

    const tip = document.createElement("span");
    tip.className = "term";
    tip.tabIndex = 0;
    tip.setAttribute("data-tip", best.def);
    tip.setAttribute("aria-label", `${best.match}: ${best.def}`);
    tip.textContent = best.match;
    frag.appendChild(tip);

    if (best.end < text.length) {
      const rest = document.createTextNode(text.slice(best.end));
      frag.appendChild(rest);
      node.parentNode.replaceChild(frag, node);
      wrapTextNode(rest);
    } else {
      node.parentNode.replaceChild(frag, node);
    }
  }

  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest(".term, .term-tip, a.brand, nav")) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest("svg")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(wrapTextNode);
  }

  function placeTip(el) {
    let tip = document.getElementById("term-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "term-tip";
      tip.className = "term-tip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    tip.textContent = el.getAttribute("data-tip") || "";
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 10;
    if (top < 8) top = r.bottom + 10;
    tip.style.position = "fixed";
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideTip() {
    const tip = document.getElementById("term-tip");
    if (tip) tip.hidden = true;
  }

  function bindTips(root) {
    root.querySelectorAll(".term").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("mouseenter", () => placeTip(el));
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("focus", () => placeTip(el));
      el.addEventListener("blur", hideTip);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const tip = document.getElementById("term-tip");
        if (tip && !tip.hidden && tip.textContent === el.getAttribute("data-tip")) hideTip();
        else placeTip(el);
      });
    });
  }

  function applyGlossary(root = document.body) {
    walk(root);
    bindTips(root);
  }

  function fillGlossaryList() {
    const ul = document.getElementById("glossary-list");
    if (!ul) return;
    const seen = new Set();
    const items = [];
    TERMS.forEach((t) => {
      const label = t.keys[0];
      if (seen.has(label.toLowerCase())) return;
      seen.add(label.toLowerCase());
      items.push({ label, def: t.def });
    });
    items.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    ul.innerHTML = items
      .map((i) => `<li><strong>${i.label}</strong> — ${i.def}</li>`)
      .join("");
  }

  window.applyGlossary = applyGlossary;

  document.addEventListener("DOMContentLoaded", () => {
    fillGlossaryList();
    applyGlossary(document.body);
    document.addEventListener("scroll", hideTip, { passive: true });
    window.addEventListener("resize", hideTip);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".term") && !e.target.closest(".term-tip")) hideTip();
    });
  });
})();
