/**
 * Mission narrator (ElevenLabs via /api/tts).
 */
(function () {
  const btn = document.getElementById("missionListen");
  const labelEl = btn?.querySelector(".mission-listen-label");

  if (!btn) return;

  const GOAL_DEFAULT = 25000;
  const PLAYBACK_RATE = 1;
  const PREFETCH_AHEAD = 1;
  const CHUNK_MAX = 420;
  const SILENT_MP3 =
    "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIgAANIAAAAQAAAaEAAAAAABAAAAAAAAAAAAAAAAAAAAAAA//tQxAAADwAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy45OS41AAAAAAAAAAAAAAA//tQxAoADwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

  let audio = null;
  let objectUrl = null;
  let chunks = [];
  let chunkIndex = 0;
  let playing = false;
  let paused = false;
  let prefetchCache = new Map();
  let audioUnlocked = false;
  const IDLE_LABEL = "Listen to our mission";

  function ensureAudio() {
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      audio.playbackRate = PLAYBACK_RATE;
    }
    return audio;
  }

  function unlockAudioPlayback() {
    if (audioUnlocked) return;
    const player = ensureAudio();
    const prevSrc = player.src;
    player.src = SILENT_MP3;
    const attempt = player.play();
    if (!attempt || typeof attempt.then !== "function") return;
    attempt
      .then(() => {
        player.pause();
        player.currentTime = 0;
        audioUnlocked = true;
      })
      .catch(() => {})
      .finally(() => {
        if (player.src === SILENT_MP3) {
          player.removeAttribute("src");
          player.load();
        } else if (prevSrc) {
          player.src = prevSrc;
        }
      });
  }

  function playbackBlocked(err) {
    const name = err?.name || "";
    const msg = String(err?.message || "");
    return name === "NotAllowedError" || /not allowed|user gesture|interact/i.test(msg);
  }

  function setLabel(text) {
    if (labelEl) labelEl.textContent = text;
  }

  function formatPlaybackError(err) {
    if (playbackBlocked(err)) return "Tap Listen again to start audio";
    if (String(err?.message || "").includes("Failed to fetch")) {
      return "Audio unavailable — try again";
    }
    return "Audio unavailable";
  }

  /** e.g. 24432 → "twenty-four thousand four hundred thirty-two" */
  function speakNum(n) {
    const num = Math.floor(Number(n));
    if (!Number.isFinite(num) || num < 0) return "";

    const ones = [
      "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
      "seventeen", "eighteen", "nineteen",
    ];
    const tens = [
      "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    ];

    function chunk(x) {
      if (x < 20) return ones[x];
      if (x < 100) {
        const t = Math.floor(x / 10);
        const o = x % 10;
        return o ? `${tens[t]}-${ones[o]}` : tens[t];
      }
      const h = Math.floor(x / 100);
      const rest = x % 100;
      return rest ? `${ones[h]} hundred ${chunk(rest)}` : `${ones[h]} hundred`;
    }

    if (num < 1000) return chunk(num);
    if (num < 1_000_000) {
      const th = Math.floor(num / 1000);
      const rest = num % 1000;
      const head = `${chunk(th)} thousand`;
      return rest ? `${head} ${chunk(rest)}` : head;
    }
    const mil = Math.floor(num / 1_000_000);
    const rest = num % 1_000_000;
    const head = `${chunk(mil)} million`;
    return rest ? `${head} ${speakNum(rest)}` : head;
  }

  function petitionStatsFromDom() {
    const raw = document.getElementById("sigNumber")?.textContent?.replace(/[^\d]/g, "");
    if (!raw) return null;
    const total = Number(raw);
    if (!Number.isFinite(total) || total <= 0) return null;
    return { total, goal: GOAL_DEFAULT };
  }

  async function fetchPetitionStats() {
    const fromDom = petitionStatsFromDom();
    if (fromDom) return fromDom;
    try {
      const res = await fetch("/api/petition-count", { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (_) {}
    try {
      const res = await fetch("data/petition-count.json", { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (_) {}
    return null;
  }

  function buildNarration(stats) {
    const total = stats?.total ?? stats?.displayed;
    const goal = stats?.goal || GOAL_DEFAULT;

    let countLine =
      "Thousands of Rams have already signed the Change.org petition to bring him back.";
    if (total != null && !Number.isNaN(Number(total))) {
      const n = Number(total);
      countLine = `${speakNum(n)} people have signed the petition on Change.org`;
      const left = Math.max(0, goal - n);
      if (left > 0) {
        countLine += `, working toward ${speakNum(goal)}`;
      }
      countLine += ".";
    }

    return [
      "We Are Rams.",
      "This is Rams Fight Back — alumni, parents, teachers, and parishioners standing with Principal Darren Mullis.",
      "We are not the parish. We are not the diocese. We are the people who know this school.",
      "Darren Mullis has been principal here since two thousand three — twenty-three years.",
      "He did not come from outside. He walked these halls as a student, first grade through eighth.",
      "Christian Brothers High School, class of eighty-six.",
      "He came home to teach, to run youth ministry and religious education, and to lead.",
      "A master's from Memphis Theological Seminary. The diocese Leadership Academy.",
      "Holy Rosary serves about four hundred fifty students now, preschool through eighth grade.",
      "Families from East Memphis and across West Tennessee.",
      "Twelve sports. Spanish, French, and Latin. Extended day. The Learning Center and the Angel Program.",
      "When something new was proposed, he asked a simple question: does it serve all of God's children, and follow the example of Jesus Christ?",
      "He wrote to parents every week.",
      "He helped start middle school youth ministry.",
      "His wife Betty Ann and their daughters Lucy and Maddia are part of this parish.",
      "The Mullis family has been here close to fifty years.",
      "On August nineteenth, families got a letter saying he would be leaving as principal.",
      "No reason was given in public.",
      "Two days later, parents and alumni gathered outside the Catholic Diocese of Memphis.",
      "WREG, the Commercial Appeal, and the Daily Memphian reported on it.",
      countLine,
      "The people signing are not strangers. They are families who trusted him with their children, and Rams who came back because of what he built.",
      "We ask the pastor of Holy Rosary, the Bishop of Memphis, and Catholic Schools of Memphis to restore Darren Mullis as principal.",
      "At twenty-five thousand signatures, we will reach out to plan a gathering within thirty days.",
      "You can sign the petition, call the offices, print the flyer, or share this site with a Ram you know.",
      "An anonymous alum has offered one million dollars toward Holy Rosary's capital campaign in Darren's honor.",
      "This site is run and paid for by a small group of older Rams. We do not solicit donations.",
      "We ask for your name, your call, and your share — so the pastor and the bishop hear the faithful.",
    ].join(" ");
  }

  function splitChunks(text) {
    const sentences = text.match(/[^.!?]+[.!?]+|\S+$/g) || [text];
    const out = [];
    let buf = "";
    for (const s of sentences) {
      const next = (buf + " " + s).trim();
      if (next.length > CHUNK_MAX && buf) {
        out.push(buf.trim());
        buf = s.trim();
      } else {
        buf = next;
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.length ? out : [text.slice(0, CHUNK_MAX)];
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clearPrefetch() {
    prefetchCache.clear();
  }

  function showError(message) {
    setLabel(message);
    btn.classList.remove("is-loading", "is-playing");
    btn.setAttribute("aria-busy", "false");
    btn.setAttribute("aria-pressed", "false");
    window.setTimeout(resetUi, 4500);
  }

  function resetUi() {
    btn.classList.remove("is-playing", "is-loading");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-busy", "false");
    setLabel(IDLE_LABEL);
  }

  function stopPlayback() {
    playing = false;
    paused = false;
    chunkIndex = 0;
    chunks = [];
    clearPrefetch();
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.removeAttribute("src");
      audio.load();
    }
    revokeUrl();
    resetUi();
  }

  async function fetchChunkAudio(text, attempt = 0) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const err = await res.json();
          detail = err.detail || err.error || "";
        } catch (_) {}
        throw new Error(detail || "audio_unavailable");
      }
      const type = res.headers.get("Content-Type") || "";
      if (!type.includes("audio")) {
        throw new Error("audio_unavailable");
      }
      return res.blob();
    } catch (err) {
      if (attempt < 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        return fetchChunkAudio(text, attempt + 1);
      }
      throw err;
    }
  }

  function prefetchChunk(index) {
    if (index < 0 || index >= chunks.length) return null;
    if (prefetchCache.has(index)) return prefetchCache.get(index);

    const promise = fetchChunkAudio(chunks[index]).catch((err) => {
      prefetchCache.delete(index);
      throw err;
    });
    prefetchCache.set(index, promise);
    return promise;
  }

  function prefetchAhead(fromIndex) {
    for (let i = fromIndex; i < Math.min(fromIndex + PREFETCH_AHEAD, chunks.length); i++) {
      prefetchChunk(i);
    }
  }

  async function playChunkBlob(blob) {
    revokeUrl();
    objectUrl = URL.createObjectURL(blob);
    const player = ensureAudio();
    player.src = objectUrl;

    return new Promise((resolve, reject) => {
      player.onended = () => resolve();
      player.onerror = () => reject(new Error("playback_failed"));
      player.play().catch(reject);
    });
  }

  async function playNextChunk() {
    if (!playing || chunkIndex >= chunks.length) {
      stopPlayback();
      return;
    }

    const current = chunkIndex;
    prefetchAhead(current + 1);

    try {
      const blob = await prefetchChunk(current);
      if (!playing || current !== chunkIndex) return;

      btn.classList.remove("is-loading");
      btn.classList.add("is-playing");
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-busy", "false");
      setLabel("Pause");

      await playChunkBlob(blob);
      if (!playing) return;

      prefetchCache.delete(current);
      chunkIndex += 1;
      await playNextChunk();
    } catch (err) {
      stopPlayback();
      showError(formatPlaybackError(err));
    }
  }

  async function startPlayback() {
    unlockAudioPlayback();

    if (playing && paused && audio) {
      paused = false;
      audio.playbackRate = PLAYBACK_RATE;
      await audio.play();
      btn.classList.add("is-playing");
      btn.setAttribute("aria-pressed", "true");
      setLabel("Pause");
      return;
    }

    if (playing && !paused) {
      audio.pause();
      paused = true;
      btn.classList.remove("is-playing", "is-loading");
      btn.setAttribute("aria-pressed", "false");
      setLabel("Resume");
      return;
    }

    stopPlayback();
    playing = true;
    chunkIndex = 0;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    setLabel("Loading…");

    try {
      const stats = petitionStatsFromDom() || (await fetchPetitionStats());
      chunks = splitChunks(buildNarration(stats));
      clearPrefetch();
      prefetchAhead(0);
      await playNextChunk();
    } catch (err) {
      stopPlayback();
      showError(formatPlaybackError(err));
    }
  }

  btn.addEventListener("click", startPlayback);

  async function init() {
    try {
      const res = await fetch("/api/tts", { cache: "no-store" });
      if (!res.ok) throw new Error("tts_status_failed");
      const cfg = await res.json();
      if (!cfg.enabled) {
        btn.hidden = true;
        return;
      }
      btn.hidden = false;
      setLabel(IDLE_LABEL);
    } catch (_) {
      btn.hidden = true;
    }
  }

  init();
})();
