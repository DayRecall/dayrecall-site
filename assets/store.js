/*
 * The App Store button. Until launch every page shows the "coming soon" pill. On launch day:
 *   1. put the App Store address in `url`: https://apps.apple.com/app/id<Apple ID>, where the
 *      Apple ID is the number under App Store Connect › the app › App Information;
 *   2. set `live` to true;
 *   3. run `python tools/stamp-assets.py` and push.
 * Every element marked data-store then becomes a link to the App Store, and every element
 * marked data-prelaunch is hidden.
 */
(function () {
  'use strict';

  var APP_STORE = {
    live: false,
    url: ''
  };

  if (!APP_STORE.live || !APP_STORE.url) return;

  function apply() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-store]'), function (a) {
      a.setAttribute('href', APP_STORE.url);
      a.hidden = false;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-prelaunch]'), function (e) {
      e.hidden = true;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
