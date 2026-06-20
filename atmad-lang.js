/** Persist UI language (en | ar) across pages via localStorage. */
(function () {
  var ATMAD_LANG_STORAGE_KEY = "atmad:lang";

  function getAtmadPreferredLang() {
    try {
      var raw = localStorage.getItem(ATMAD_LANG_STORAGE_KEY);
      if (raw === "ar" || raw === "en") return raw;
    } catch (e) {}
    return "en";
  }

  function setAtmadPreferredLang(lang) {
    var next = lang === "ar" ? "ar" : "en";
    try {
      localStorage.setItem(ATMAD_LANG_STORAGE_KEY, next);
    } catch (e) {}
    return next;
  }

  /** html[lang|dir], [data-en]/[data-ar] strings, .lang-btn labels; sets window.atmadLang. */
  function applyAtmadLanguageUI(lang) {
    if (typeof document === "undefined") return;
    var l = lang === "ar" ? "ar" : "en";
    window.atmadLang = l;
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-en]").forEach(function (el) {
      var key = l === "ar" ? "data-ar" : "data-en";
      if (el.hasAttribute(key)) el.textContent = el.getAttribute(key);
    });
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.textContent = l === "ar" ? "English" : "العربية";
    });
  }

  window.getAtmadPreferredLang = getAtmadPreferredLang;
  window.setAtmadPreferredLang = setAtmadPreferredLang;
  window.applyAtmadLanguageUI = applyAtmadLanguageUI;
})();
