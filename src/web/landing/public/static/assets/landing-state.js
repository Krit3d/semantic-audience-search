(function () {
  'use strict';
  const storageKey = 'collabrama-landing-language-state';
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch (error) {
    saved = null;
  }
  window.collabramaLandingInitialState = saved && saved.state ? saved.state : null;
  window.bindLandingState = function (component) {
    const languageLink = document.querySelector('.hdr-ru');
    if (languageLink) {
      languageLink.addEventListener('click', function () {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ state: component.state, scrollY: window.scrollY }));
        } catch (error) {
          return;
        }
      });
    }
    if (saved && Number.isFinite(saved.scrollY)) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
          try {
            sessionStorage.removeItem(storageKey);
          } catch (error) {
            return;
          }
        });
      });
    }
  };
})();
