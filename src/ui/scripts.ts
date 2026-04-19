export const APP_JS = `document.addEventListener('submit', function (e) {
  var t = e.target;
  if (t && t.matches && t.matches('form[data-confirm]')) {
    var msg = t.getAttribute('data-confirm');
    if (!window.confirm(msg)) { e.preventDefault(); }
  }
});
`;
