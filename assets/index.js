(function () {
  "use strict";

  var STORAGE_KEY = "nexdl-theme";

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
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
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
    var loadingBar = document.getElementById("urlLoadingBar");
    var loadingOverlay = document.getElementById("heroLoadingOverlay");
    var pasteTimer;

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

    function showFakeLoading() {
      if (!urlInput.value.trim()) return;
      loadingBar.classList.add("is-active");
      if (loadingOverlay) {
        loadingOverlay.classList.remove("d-none");
        loadingOverlay.classList.add("d-flex");
        loadingOverlay.setAttribute("aria-hidden", "false");
      }
      window.clearTimeout(pasteTimer);
      pasteTimer = window.setTimeout(function () {
        loadingBar.classList.remove("is-active");
        if (loadingOverlay) {
          loadingOverlay.classList.remove("d-flex");
          loadingOverlay.classList.add("d-none");
          loadingOverlay.setAttribute("aria-hidden", "true");
        }
      }, 1800);
    }

    urlInput.addEventListener("input", function () {
      updatePlatformIcon(urlInput.value);
    });

    urlInput.addEventListener("paste", function () {
      window.setTimeout(function () {
        updatePlatformIcon(urlInput.value);
        showFakeLoading();
      }, 0);
    });

    document.getElementById("heroDownloadBtn")?.addEventListener("click", function (e) {
      e.preventDefault();
      showFakeLoading();
    });

    document.getElementById("pasteUrlBtn")?.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          urlInput.value = t;
          updatePlatformIcon(t);
          showFakeLoading();
        }).catch(function () {});
      }
    });

    updatePlatformIcon(urlInput.value);
  });
})();
