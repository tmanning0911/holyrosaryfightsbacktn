(function () {
  const ASSET_V = "20260826f";
  const grid = document.getElementById("galleryGrid");
  const credits = document.getElementById("galleryCredits");
  const intro = document.getElementById("galleryIntro");
  const lightbox = document.getElementById("galleryLightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxCaption = document.getElementById("lightboxCaption");

  if (!grid) return;

  function assetUrl(path) {
    if (!path) return path;
    return path.includes("?") ? path : `${path}?v=${ASSET_V}`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function creditLine(photo) {
    if (photo.credit && photo.outlet && photo.credit !== photo.outlet) {
      return `${photo.credit} / ${photo.outlet}`;
    }
    return photo.credit || photo.outlet || "News photo";
  }

  function render(data) {
    if (data.event && intro) {
      intro.textContent = `${data.event} Photos from published coverage — credited to the photographers and outlets below.`;
    }

    grid.innerHTML = data.photos
      .map(
        (photo, i) => `
      <button type="button" class="gallery-card" data-index="${i}" aria-label="Open photo: ${esc(photo.alt)}">
        <img src="${esc(assetUrl(photo.src))}" alt="${esc(photo.alt)}" loading="lazy" width="800" height="533" />
        <span class="gallery-card-meta">
          <span class="gallery-card-outlet">${esc(photo.outlet || "")}</span>
          <span class="gallery-card-credit">${esc(creditLine(photo))}</span>
        </span>
      </button>`
      )
      .join("");

    if (credits) {
      credits.innerHTML = data.photos
        .map(
          (photo) => `
        <li>
          <strong>${esc(creditLine(photo))}</strong> — ${esc(photo.caption || photo.alt)}
          <a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener">Read the story</a>
        </li>`
        )
        .join("");
    }

    grid.querySelectorAll(".gallery-card").forEach((btn) => {
      btn.addEventListener("click", () => openLightbox(data.photos[Number(btn.dataset.index)]));
    });
  }

  function openLightbox(photo) {
    if (!lightbox || !lightboxImg || !lightboxCaption || !photo) return;
    lightboxImg.src = assetUrl(photo.src);
    lightboxImg.alt = photo.alt;
    lightboxCaption.innerHTML = `
      <p>${esc(photo.caption || photo.alt)}</p>
      <p class="gallery-lightbox-credit">${esc(creditLine(photo))} · ${esc(photo.date || "")}
        <a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener">Original article</a>
      </p>`;
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    if (lightboxImg) lightboxImg.src = "";
    document.body.classList.remove("lightbox-open");
  }

  lightbox?.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox && !lightbox.hidden) closeLightbox();
  });

  fetch(`data/protest-gallery.json?v=${ASSET_V}`, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("Could not load gallery data");
      return r.json();
    })
    .then(render)
    .catch(() => {
      grid.innerHTML = "<p class=\"gallery-error\">Could not load protest photos. Open this page from a local server.</p>";
    });
})();
