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

  function setHeroAnalyzing(on) {
    var line = document.getElementById("inputLineLoader");
    if (line) {
      line.classList.toggle("d-none", !on);
      line.setAttribute("aria-hidden", on ? "false" : "true");
    }
    var btn = document.getElementById("heroDownloadBtn");
    if (btn) {
      btn.disabled = on;
      var lab = btn.querySelector(".hero-btn-label");
      var sp = btn.querySelector(".hero-btn-spinner");
      if (lab) lab.classList.toggle("invisible", on);
      if (sp) sp.classList.toggle("d-none", !on);
    }
  }

  function setPreviewDownloading(on) {
    var btn = document.getElementById("previewDownloadBtn");
    if (!btn) return;
    var sel = document.getElementById("qualitySelect");
    var hasVal = !!(sel && sel.value);
    var lab = btn.querySelector(".preview-dl-label");
    var sp = btn.querySelector(".preview-dl-spinner");
    if (on) {
      btn.disabled = true;
      if (lab) lab.classList.add("invisible");
      if (sp) sp.classList.remove("d-none");
      return;
    }
    if (lab) lab.classList.remove("invisible");
    if (sp) sp.classList.add("d-none");
    btn.disabled = !hasVal;
  }

  function showPasteLayout() {
    document.getElementById("heroPasteSection")?.classList.remove("d-none");
    document.getElementById("previewResultSection")?.classList.add("d-none");
    hideAllErrors();
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
    var sel = document.getElementById("qualitySelect");
    if (sel) {
      sel.innerHTML = "";
      var o = document.createElement("option");
      o.value = "";
      o.textContent = "—";
      sel.appendChild(o);
    }
    var pbtn = document.getElementById("previewDownloadBtn");
    if (pbtn) pbtn.disabled = true;
    showPasteLayout();
    document.getElementById("downloaderFlow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    var pic = document.getElementById("platformIcon");
    if (pic) {
      pic.className = "nx-platform-icon bi bi-link-45deg text-secondary";
    }
  }

  function applyAnalyzeToPreview(data) {
    var titleEl = document.getElementById("previewTitle");
    var metaEl = document.getElementById("previewMeta");
    var badgeEl = document.getElementById("previewBadge");
    var sel = document.getElementById("qualitySelect");
    var thumb = document.getElementById("previewThumb");
    var vid = document.getElementById("previewVideo");
    var ph = document.getElementById("previewThumbPh");
    var dlBtn = document.getElementById("previewDownloadBtn");

    if (titleEl) titleEl.textContent = data.title || "Untitled";
    if (badgeEl) badgeEl.textContent = (data.platform || "media").toUpperCase();

    var mh = maxFormatHeight(data.formats);
    var parts = [];
    if (mh) parts.push("Up to " + mh + "p");
    parts.push(formatDuration(data.duration));
    parts.push((data.media_type || "video").toUpperCase());
    if (metaEl) metaEl.textContent = parts.join(" · ");

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

    if (sel) {
      sel.innerHTML = "";
      var qs = data.qualities || [];
      if (!qs.length) {
        var ox = document.createElement("option");
        ox.value = "";
        ox.textContent = "No formats available";
        sel.appendChild(ox);
        if (dlBtn) dlBtn.disabled = true;
        return;
      }
      qs.forEach(function (q) {
        var opt = document.createElement("option");
        opt.value = q.format_id;
        opt.textContent = q.label || q.name || q.format_id;
        sel.appendChild(opt);
      });
      if (dlBtn) dlBtn.disabled = false;
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

    document.getElementById("qualitySelect")?.addEventListener("change", function () {
      var sel = document.getElementById("qualitySelect");
      var btn = document.getElementById("previewDownloadBtn");
      if (btn && sel) btn.disabled = !sel.value;
    });

    document.getElementById("previewDownloadBtn")?.addEventListener("click", function () {
      hideAllErrors();
      var sel = document.getElementById("qualitySelect");
      var fid = sel && sel.value;
      if (!lastMediaUrl || !fid) {
        showApiError("Pick a format first.");
        return;
      }
      setPreviewDownloading(true);
      downloadFile(lastMediaUrl, fid)
        .catch(function (err) {
          showApiError(err.message || "Download failed.");
        })
        .finally(function () {
          setPreviewDownloading(false);
        });
    });

    updatePlatformIcon(urlInput.value);
  });
})();
