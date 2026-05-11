(function () {
  "use strict";

  var STORAGE_KEY = "nexdl-theme";

  var API_BASE = String(window.NEXDL_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

  var lastMediaUrl = "";
  var analyzing = false;

  function getPreferredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    var btn = document.getElementById("themeToggle");
    if (btn) {
      var icon = btn.querySelector("i");
      if (icon) {
        icon.className =
          theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
      }
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  }

  function apiUrl(path) {
    return API_BASE + (path.charAt(0) === "/" ? path : "/" + path);
  }

  function isResultViewVisible() {
    var sec = document.getElementById("previewResultSection");
    return sec && !sec.classList.contains("d-none");
  }

  function hideAllErrors() {
    ["apiError", "apiErrorResult"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.add("d-none");
        el.textContent = "";
      }
    });
  }

  function showApiError(msg) {
    var id = isResultViewVisible() ? "apiErrorResult" : "apiError";
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("d-none");
  }

  async function readJsonError(res) {
    try {
      var j = await res.clone().json();
      if (j && j.message) return j.message;
      if (j && j.detail && j.detail.message) return j.detail.message;
    } catch (e) {
      /* ignore */
    }
    return res.statusText || "Request failed";
  }

  function formatDuration(sec) {
    if (sec == null || isNaN(sec)) return "—";
    var s = Math.floor(Number(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function maxFormatHeight(formats) {
    var max = 0;
    (formats || []).forEach(function (f) {
      if (f.height && f.height > max) max = f.height;
    });
    return max;
  }

  function setUrlFieldLocked(locked) {
    var input = document.getElementById("mediaUrl");
    var paste = document.getElementById("pasteUrlBtn");
    if (input) {
      input.disabled = locked;
      input.setAttribute("aria-busy", locked ? "true" : "false");
    }
    if (paste) paste.disabled = locked;
  }

  function setHeroAnalyzing(on) {
    setUrlFieldLocked(on);
    var btn = document.getElementById("heroDownloadBtn");
    if (btn) {
      btn.disabled = on;
      var lab = btn.querySelector(".hero-btn-label");
      var sp = btn.querySelector(".hero-btn-spinner");
      if (lab) lab.classList.toggle("invisible", on);
      if (sp) sp.classList.toggle("d-none", !on);
    }
  }

  function setPreviewDownloading(on, activeBtn) {
    var body = document.getElementById("formatOptionsBody");
    var buttons = body ? body.querySelectorAll(".nx-preview-row-dl") : [];
    buttons.forEach(function (b) {
      b.disabled = !!on;
    });
    if (activeBtn) {
      var lab = activeBtn.querySelector(".nx-row-dl-label");
      var sp = activeBtn.querySelector(".nx-row-dl-spinner");
      if (on) {
        if (lab) lab.classList.add("invisible");
        if (sp) sp.classList.remove("d-none");
      } else {
        if (lab) lab.classList.remove("invisible");
        if (sp) sp.classList.add("d-none");
      }
    }
  }

  function showPasteLayout() {
    document.getElementById("heroPasteSection")?.classList.remove("d-none");
    document.getElementById("previewResultSection")?.classList.add("d-none");
    hideAllErrors();
    setUrlFieldLocked(false);
  }

  function showResultLayout() {
    document.getElementById("heroPasteSection")?.classList.add("d-none");
    document.getElementById("previewResultSection")?.classList.remove("d-none");
  }

  function clearPreviewMedia() {
    var thumb = document.getElementById("previewThumb");
    var vid = document.getElementById("previewVideo");
    var ph = document.getElementById("previewThumbPh");
    if (vid) {
      try {
        vid.pause();
      } catch (e) {
        /* ignore */
      }
      vid.removeAttribute("src");
      try {
        vid.load();
      } catch (e2) {
        /* ignore */
      }
      vid.classList.add("d-none");
    }
    if (thumb) {
      thumb.removeAttribute("src");
      thumb.classList.add("d-none");
    }
    ph?.classList.remove("d-none");
  }

  function resetToAnotherFile() {
    lastMediaUrl = "";
    var urlInput = document.getElementById("mediaUrl");
    if (urlInput) urlInput.value = "";
    clearPreviewMedia();
    var body = document.getElementById("formatOptionsBody");
    if (body) body.innerHTML = "";
    var t = document.getElementById("previewTitle");
    var d = document.getElementById("previewDuration");
    var s = document.getElementById("previewSubmeta");
    var b = document.getElementById("previewBadge");
    if (t) t.textContent = "—";
    if (d) d.textContent = "—";
    if (s) {
      s.textContent = "";
      s.classList.add("d-none");
    }
    if (b) b.textContent = "—";
    showPasteLayout();
    document.getElementById("downloaderFlow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    var pic = document.getElementById("platformIcon");
    if (pic) {
      pic.className = "nx-platform-icon bi bi-link-45deg text-secondary";
    }
  }

  function rowFormatExt(q) {
    var fid = q.format_id || "";
    if (fid.indexOf("nexdl:mp3") === 0) return "MP3";
    return "MP4";
  }

  function qualityCellText(q, mediaType) {
    if (q.format_id && String(q.format_id).indexOf("nexdl:mp3") === 0) {
      return "320";
    }
    if (mediaType === "audio") {
      var lab = q.label || "";
      var peak = /\(\s*~\s*(\d+)\s*kb\/s\s*peak\s*\)/i.exec(lab);
      if (peak) return peak[1];
      var kb = /(\d{2,4})\s*kb\/s/i.exec(lab);
      if (kb) return kb[1];
      var short = lab.replace(/^Best audio\s*/i, "").trim();
      if (short.length > 18) return short.slice(0, 15) + "…";
      return short || "—";
    }
    if (q.max_height != null && q.max_height > 0) return String(q.max_height);
    var label = (q.label || "").trim();
    var m = /^(\d{3,4})p?$/i.exec(label);
    if (m) return m[1];
    if (label.length <= 16) return label;
    return label.slice(0, 13) + "…";
  }

  function appendFormatRow(body, formatId, extLabel, qualityText, dlLabel) {
    var row = document.createElement("div");
    row.className = "nx-format-row border-bottom border-secondary-subtle";

    var left = document.createElement("div");
    left.className =
      "nx-format-row-left d-flex align-items-center justify-content-between py-2 px-3 gap-2";

    var ext = document.createElement("span");
    ext.className = "nx-format-ext small text-body-emphasis fw-normal";
    ext.textContent = extLabel;

    var qual = document.createElement("span");
    qual.className =
      "nx-format-quality text-body-secondary small text-end fw-normal flex-shrink-0";
    qual.textContent = qualityText;

    left.appendChild(ext);
    left.appendChild(qual);

    var right = document.createElement("div");
    right.className =
      "nx-format-row-dl-cell d-flex align-items-center justify-content-start border-start border-secondary-subtle py-2 px-3";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "btn btn-success btn-sm rounded-3 nx-preview-row-dl text-white w-100";
    btn.setAttribute("data-format-id", formatId);

    var lab = document.createElement("span");
    lab.className = "nx-row-dl-label d-inline-flex align-items-center gap-1";
    var ic = document.createElement("i");
    ic.className = "bi bi-download";
    ic.setAttribute("aria-hidden", "true");
    lab.appendChild(ic);
    lab.appendChild(document.createTextNode(" " + (dlLabel || "Download")));

    var sp = document.createElement("span");
    sp.className = "nx-row-dl-spinner d-none";
    sp.setAttribute("aria-hidden", "true");
    var spin = document.createElement("span");
    spin.className = "nx-spinner-inline nx-spinner-inline--light";
    sp.appendChild(spin);

    btn.appendChild(lab);
    btn.appendChild(sp);
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    body.appendChild(row);
  }

  function applyAnalyzeToPreview(data) {
    var titleEl = document.getElementById("previewTitle");
    var durationEl = document.getElementById("previewDuration");
    var submetaEl = document.getElementById("previewSubmeta");
    var badgeEl = document.getElementById("previewBadge");
    var body = document.getElementById("formatOptionsBody");
    var thumb = document.getElementById("previewThumb");
    var vid = document.getElementById("previewVideo");
    var ph = document.getElementById("previewThumbPh");

    var mediaType = data.media_type || "video";

    if (titleEl) titleEl.textContent = data.title || "Untitled";
    if (badgeEl) badgeEl.textContent = (data.platform || "media").toUpperCase();

    var mh = maxFormatHeight(data.formats);
    if (durationEl) durationEl.textContent = formatDuration(data.duration);
    if (submetaEl) {
      if (mh && mediaType !== "audio") {
        submetaEl.textContent = "Up to " + mh + "p";
        submetaEl.classList.remove("d-none");
      } else {
        submetaEl.textContent = "";
        submetaEl.classList.add("d-none");
      }
    }

    clearPreviewMedia();

    var previewUrl = (data.preview_url || "").trim();
    var useVideo = previewUrl && /\.(mp4|webm)(\?|#|$|&)/i.test(previewUrl);

    if (useVideo && vid) {
      vid.src = previewUrl;
      vid.classList.remove("d-none");
      ph?.classList.add("d-none");
    } else if (data.thumbnail && thumb) {
      var triedCors = false;
      thumb.onload = function () {
        thumb.classList.remove("d-none");
        ph?.classList.add("d-none");
      };
      thumb.onerror = function () {
        if (!triedCors) {
          triedCors = true;
          thumb.removeAttribute("crossorigin");
          thumb.src = data.thumbnail;
          return;
        }
        thumb.classList.add("d-none");
        ph?.classList.remove("d-none");
      };
      thumb.crossOrigin = "anonymous";
      thumb.src = data.thumbnail;
      thumb.alt = data.title || "";
    }

    if (body) {
      body.innerHTML = "";
      var qs = data.qualities || [];
      if (!qs.length) {
        var empty = document.createElement("div");
        empty.className = "small text-body-secondary py-3 px-3 mb-0";
        empty.textContent = "No formats available";
        body.appendChild(empty);
        return;
      }
      qs.forEach(function (q) {
        var fid = q.format_id;
        if (!fid) return;
        appendFormatRow(
          body,
          fid,
          rowFormatExt(q),
          qualityCellText(q, mediaType),
          "Download"
        );
      });
    }
  }

  async function analyzeUrl(url) {
    var res = await fetch(apiUrl("/analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!res.ok) {
      var msg = await readJsonError(res);
      throw new Error(msg);
    }
    return res.json();
  }

  async function downloadFile(url, formatId) {
    var res = await fetch(apiUrl("/download"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify({ url: url.trim(), format_id: formatId }),
    });
    if (!res.ok) {
      var msg = await readJsonError(res);
      throw new Error(msg);
    }
    var blob = await res.blob();
    var name = "download.bin";
    var cd = res.headers.get("Content-Disposition");
    if (cd) {
      var m = /filename="([^"]+)"/.exec(cd);
      if (m) name = m[1];
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getPreferredTheme());

    document.getElementById("themeToggle")?.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-bs-theme") === "dark"
          ? "light"
          : "dark";
      applyTheme(next);
    });

    var urlInput = document.getElementById("mediaUrl");
    var platformIcon = document.getElementById("platformIcon");

    var patterns = [
      { test: /youtube\.com|youtu\.be/i, icon: "bi-youtube", class: "text-danger" },
      { test: /instagram\.com/i, icon: "bi-instagram", class: "text-warning" },
      { test: /tiktok\.com/i, icon: "bi-tiktok", class: "" },
      { test: /facebook\.com|fb\.watch/i, icon: "bi-facebook", class: "text-primary" },
      { test: /pinterest\.com|pin\.it/i, icon: "bi-pinterest", class: "text-danger" },
      { test: /twitter\.com|x\.com/i, icon: "bi-twitter-x", class: "" },
      { test: /vimeo\.com/i, icon: "bi-camera-reels", class: "text-info" },
    ];

    function defaultIcon() {
      platformIcon.className =
        "nx-platform-icon bi bi-link-45deg text-secondary";
    }

    function updatePlatformIcon(value) {
      if (!value || value.trim().length < 8) {
        defaultIcon();
        return;
      }
      for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test.test(value)) {
          platformIcon.className =
            "nx-platform-icon bi " +
            patterns[i].icon +
            (patterns[i].class ? " " + patterns[i].class : "");
          return;
        }
      }
      defaultIcon();
    }

    urlInput.addEventListener("input", function () {
      updatePlatformIcon(urlInput.value);
    });

    urlInput.addEventListener("paste", function () {
      window.setTimeout(function () {
        updatePlatformIcon(urlInput.value);
      }, 0);
    });

    document.getElementById("heroDownloadBtn")?.addEventListener("click", function (e) {
      e.preventDefault();
      hideAllErrors();
      var url = (urlInput && urlInput.value) ? urlInput.value.trim() : "";
      if (!url) {
        showApiError("Paste a video or post URL first.");
        return;
      }
      if (analyzing) return;
      analyzing = true;
      setHeroAnalyzing(true);
      analyzeUrl(url)
        .then(function (data) {
          lastMediaUrl = url;
          applyAnalyzeToPreview(data);
          showResultLayout();
          document.getElementById("previewResultSection")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        })
        .catch(function (err) {
          showApiError(err.message || "Analyze failed. Is the API running at " + API_BASE + "?");
        })
        .finally(function () {
          analyzing = false;
          setHeroAnalyzing(false);
        });
    });

    document.getElementById("pasteUrlBtn")?.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          urlInput.value = t;
          updatePlatformIcon(t);
        }).catch(function () {});
      }
    });

    document.getElementById("previewAnotherBtn")?.addEventListener("click", function () {
      hideAllErrors();
      resetToAnotherFile();
    });

    document.getElementById("formatOptionsBody")?.addEventListener("click", function (e) {
      var btn = e.target.closest(".nx-preview-row-dl");
      if (!btn || btn.disabled) return;
      var fid = btn.getAttribute("data-format-id");
      hideAllErrors();
      if (!lastMediaUrl || !fid) {
        showApiError("Pick a format first.");
        return;
      }
      setPreviewDownloading(true, btn);
      downloadFile(lastMediaUrl, fid)
        .catch(function (err) {
          showApiError(err.message || "Download failed.");
        })
        .finally(function () {
          setPreviewDownloading(false, btn);
        });
    });

    updatePlatformIcon(urlInput.value);
  });
})();
