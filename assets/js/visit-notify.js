/* Скрытый ping захода → письмо на почту. На сайте ничего не рисует. */
(() => {
  const MAIL = "puholet@gmail.com";
  const ONCE_KEY = "rassvet_visit_ping_v1";

  // Один раз за вкладку/сессию — без спама при F5
  try {
    if (sessionStorage.getItem(ONCE_KEY)) return;
    sessionStorage.setItem(ONCE_KEY, "1");
  } catch (_) {
    /* private mode — всё равно шлём */
  }

  async function getIpGeo() {
    try {
      const g = await fetch("https://get.geojs.io/v1/ip/geo.json", { cache: "no-store" }).then((r) =>
        r.json()
      );
      return {
        ip: g.ip || "н/д",
        geo: [g.city, g.region, g.country].filter(Boolean).join(", ") || "н/д",
      };
    } catch (_) {
      try {
        const j = await fetch("https://api.ipify.org?format=json", { cache: "no-store" }).then((r) =>
          r.json()
        );
        return { ip: j.ip || "н/д", geo: "н/д" };
      } catch (_) {
        return { ip: "н/д", geo: "н/д" };
      }
    }
  }

  async function hitCounter() {
    try {
      const j = await fetch("https://abacus.jasoncameron.dev/hit/puholet-bureau1440/rassvet", {
        cache: "no-store",
      }).then((r) => r.json());
      if (j && j.value != null) return String(j.value);
    } catch (_) {}
    return "н/д";
  }

  async function notify() {
    const [{ ip, geo }, visitNo] = await Promise.all([getIpGeo(), hitCounter()]);
    const when = new Date();
    const payload = {
      _subject: `Рассвет · заход #${visitNo}`,
      _template: "table",
      _captcha: "false",
      _honey: "",
      message: `Новый заход на Бюро 1440 · Рассвет`,
      visit_number: visitNo,
      when_iso: when.toISOString(),
      when_local: when.toLocaleString("ru-RU", { timeZoneName: "short" }),
      page: location.href,
      referrer: document.referrer || "(прямой заход)",
      ip,
      geo,
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${screen.width}×${screen.height}`,
      user_agent: navigator.userAgent || "",
    };

    await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(MAIL)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  }

  function start() {
    setTimeout(() => {
      notify().catch(() => {});
    }, 600);
  }

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
