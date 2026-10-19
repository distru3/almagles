// Sets the theme before the page draws, so there's no flash of the wrong one.
// Night («السَّحَر») is the default; light only when the visitor chose it with the toggle.
//
// This lives in its own file, not inline in index.html: the production
// Content-Security-Policy allows scripts from this site ('self') but blocks
// inline scripts, so an inline version silently never ran.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('almagles_theme_v2');
  } catch (e) {
    /* storage blocked (private mode): fall back to the default */
  }
  if (saved !== 'light') {
    document.documentElement.classList.add('dark');
  } else {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#f5efe3');
  }
})();
