/* Local-only homepage behavior — do not deploy without asking */
(function () {
  const PETITION = "https://c.org/2LMccZY9dk";
  const topbar = document.getElementById("topbar");
  const menuToggle = document.getElementById("menuToggle");
  const searchJump = document.getElementById("searchJump");
  const resourceSearch = document.getElementById("resourceSearch");
  const searchHits = document.getElementById("searchHits");

  const RESOURCES = [
    { q: "petition sign change.org restore 25000", label: "Sign the petition on Change.org", href: PETITION },
    { q: "mobilize protest gather 25k call", label: "Join the call to mobilize", href: "#top" },
    { q: "call phone pastor clark", label: "Call Fr. James Clark (pastor)", href: "tel:+19017676949" },
    { q: "call bishop talley", label: "Call Bishop David Talley", href: "tel:+19013731200" },
    { q: "call chris fay catholic schools superintendent", label: "Call Dr. Chris Fay (superintendent)", href: "tel:+19013731221" },
    { q: "darren mullis milestones legacy principal built", label: "His milestones — what he built", href: "#legacy" },
    { q: "story timeline what happened letter", label: "What is known (timeline)", href: "#story" },
    { q: "print one pager flyer", label: "Print the one-pager", href: "one-pager.html" },
    { q: "protest photos gallery aug 21 demonstration", label: "Aug. 21 protest photos", href: "gallery.html" },
  ];

  if (menuToggle && topbar) {
    menuToggle.addEventListener("click", () => {
      const open = topbar.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("nav-open", open);
    });
    topbar.querySelectorAll(".nav-left a").forEach((a) => {
      a.addEventListener("click", () => {
        topbar.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-open");
      });
    });
  }

  if (searchJump && resourceSearch) {
    const goSearch = () => {
      document.getElementById("help")?.scrollIntoView({ behavior: "smooth" });
      resourceSearch.focus();
    };
    searchJump.addEventListener("click", goSearch);
    document.getElementById("navSearchMobile")?.addEventListener("click", (e) => {
      e.preventDefault();
      topbar?.classList.remove("open");
      menuToggle?.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
      goSearch();
    });
  }

  function renderHits(term) {
    if (!searchHits) return;
    const t = term.trim().toLowerCase();
    if (!t) {
      searchHits.innerHTML = "";
      return;
    }
    const matches = RESOURCES.filter((r) => r.q.includes(t) || r.label.toLowerCase().includes(t)).slice(0, 6);
    searchHits.innerHTML = matches
      .map((r) => `<a href="${r.href}"${r.href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${r.label}</a>`)
      .join("");
  }

  resourceSearch?.addEventListener("input", (e) => renderHits(e.target.value));

  /* Live Change.org signature count */
  (function petitionCount() {
    const numberEl = document.getElementById("sigNumber");
    const meterEl = document.getElementById("sigMeter");
    const goalEl = document.getElementById("sigGoalText");
    const updatedEl = document.getElementById("sigUpdated");
    const ctaEl = document.getElementById("sigCta");
    const box = document.getElementById("sigLive");
    const sharePulse = document.getElementById("sharePulse");
    if (!numberEl || !box) return;

    const GOAL_DEFAULT = 25000;
    const POLL_MS = 60000;

    function fmt(n) {
      return Number(n).toLocaleString("en-US");
    }

    function renderSharePulse(data) {
      if (!sharePulse) return;
      const daily = data?.daily;
      const weekly = data?.weekly;
      const total = data?.total ?? data?.displayed;
      const parts = [];
      if (daily != null && !Number.isNaN(Number(daily))) {
        parts.push(`${fmt(daily)} signed today`);
      }
      if (weekly != null && !Number.isNaN(Number(weekly))) {
        parts.push(`${fmt(weekly)} this week`);
      }
      if (!parts.length && total != null && !Number.isNaN(Number(total))) {
        parts.push(`${fmt(total)} Rams so far`);
      }
      sharePulse.textContent = parts.length
        ? `${parts.join(" · ")} — keep sharing`
        : "Every share brings another Ram";
    }

    function render(data) {
      const total = data?.total ?? data?.displayed;
      const goal = data?.goal || GOAL_DEFAULT;
      renderSharePulse(data);
      if (total == null || Number.isNaN(Number(total))) {
        box.classList.add("is-error");
        numberEl.textContent = "See Change.org";
        if (updatedEl) updatedEl.textContent = "Count unavailable right now";
        if (ctaEl) ctaEl.textContent = "Sign as a Ram";
        return;
      }
      box.classList.remove("is-error");
      numberEl.textContent = fmt(total);
      if (ctaEl) ctaEl.textContent = `Join ${fmt(total)} Rams`;
      const pct = Math.max(0, Math.min(100, (Number(total) / goal) * 100));
      if (meterEl) meterEl.style.width = pct.toFixed(1) + "%";
      if (goalEl) {
        const left = Math.max(0, goal - Number(total));
        const daily = data?.daily;
        const base =
          left > 0 ? `${fmt(left)} to go · goal ${fmt(goal)}` : `Goal reached · ${fmt(goal)}`;
        goalEl.textContent =
          daily != null && !Number.isNaN(Number(daily))
            ? `${base} · ${fmt(daily)} today`
            : base;
      }
      if (updatedEl) {
        const when = data.updatedAt ? new Date(data.updatedAt) : new Date();
        const t = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        updatedEl.textContent = `Live · updated ${t}`;
      }
    }

    async function pull() {
      try {
        const res = await fetch("/api/petition-count", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        render(data);
        return;
      } catch (_) {
        try {
          const res = await fetch("data/petition-count.json", { cache: "no-store" });
          if (!res.ok) throw new Error("no cache");
          render(await res.json());
        } catch (__) {
          render(null);
        }
      }
    }

    pull();
    window.setInterval(pull, POLL_MS);
  })();

  const THANKS =
    "You’re on the list. When we hit 25,000 signatures, we’ll reach out to plan the gathering within 30 days. Opening the petition now — sign if you haven’t.";

  function encodeForm(form) {
    return new URLSearchParams(new FormData(form)).toString();
  }

  async function submitNetlifyForm(form) {
    const res = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm(form),
    });
    if (!res.ok) throw new Error("form_failed");
  }

  async function sendWelcomeEmailNow(email, emailOk) {
    if (!email || !emailOk) return { ok: false, skipped: true };
    const payload = JSON.stringify({ email, email_ok: true });
    const tryOnce = () =>
      fetch("/api/welcome-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const err = new Error(data.error || "welcome_failed");
          err.data = data;
          throw err;
        }
        return data;
      });

    try {
      return await tryOnce();
    } catch (first) {
      console.warn("welcome-send retry", first && first.message);
      try {
        return await tryOnce();
      } catch (second) {
        console.error("welcome-send failed", second && second.message, second && second.data);
        return { ok: false, error: String(second && second.message ? second.message : second) };
      }
    }
  }

  function wireMobilize(form, msgEl) {
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      if (msgEl) msgEl.textContent = "Saving…";

      const host = location.hostname;
      const isLocal = host === "127.0.0.1" || host === "localhost";

      // Snapshot email for a client-side welcome attempt (webhook is the reliable backup)
      const email = (form.querySelector('[name="email"]')?.value || "").trim();
      const emailOkEl = form.querySelector('[name="email_ok"]');
      const emailOk = emailOkEl ? emailOkEl.checked : true;

      try {
        if (isLocal) {
          try {
            const data = Object.fromEntries(new FormData(form).entries());
            const key = "rfb_mobilize";
            const prev = JSON.parse(localStorage.getItem(key) || "[]");
            prev.push({ ...data, at: new Date().toISOString() });
            localStorage.setItem(key, JSON.stringify(prev));
          } catch (_) {}
        } else {
          // Save to Netlify Forms first — site hook also POSTs to /api/welcome-send
          await submitNetlifyForm(form);
          // Client attempt (fast path); hook covers misses / Safari quirks
          void sendWelcomeEmailNow(email, emailOk);
        }

        if (msgEl) msgEl.textContent = THANKS;
        window.open(PETITION, "_blank", "noopener");
        form.reset();
        const emailOkReset = form.querySelector('[name="email_ok"]');
        if (emailOkReset) emailOkReset.checked = true;
      } catch (_) {
        if (msgEl) {
          msgEl.textContent =
            "Something went wrong saving your info. Please try again, or email us after you sign the petition.";
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  wireMobilize(document.getElementById("joinForm"), document.getElementById("joinMsg"));
  wireMobilize(document.getElementById("footerForm"), document.getElementById("footerMsg"));

  /* Media inquiry modal */
  (function mediaInquiry() {
    const modal = document.getElementById("mediaModal");
    const openBtn = document.getElementById("mediaOpen");
    const form = document.getElementById("mediaForm");
    const msg = document.getElementById("mediaMsg");
    if (!modal || !openBtn) return;

    const open = () => {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      modal.querySelector('input[name="name"]')?.focus();
    };
    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = "";
      openBtn.focus();
    };

    openBtn.addEventListener("click", open);
    modal.querySelectorAll("[data-media-close]").forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    form?.addEventListener("submit", (e) => {
      const host = location.hostname;
      const isLocal = host === "127.0.0.1" || host === "localhost";
      if (isLocal) {
        e.preventDefault();
        try {
          const data = Object.fromEntries(new FormData(form).entries());
          const key = "rfb_media";
          const prev = JSON.parse(localStorage.getItem(key) || "[]");
          prev.push({ ...data, at: new Date().toISOString() });
          localStorage.setItem(key, JSON.stringify(prev));
        } catch (_) {}
        if (msg) msg.textContent = "Saved locally for preview. On deploy, this will go to Netlify Forms.";
        form.reset();
      } else if (msg) {
        msg.textContent = "Thanks — we’ll follow up as soon as we can.";
      }
    });
  })();

  const localBar = document.getElementById("localPreviewBar");
  const host = location.hostname;
  const isLocal = host === "127.0.0.1" || host === "localhost";
  if (localBar && isLocal) {
    localBar.hidden = false;
    localBar.classList.add("is-visible");
  }
})();
