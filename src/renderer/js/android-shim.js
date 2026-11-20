// Android only: turns the native WoofNative object (Kotlin, added by the app) into the same window.woof API that the
// Windows/Mac app exposes from preload.js, so the game code is identical on every platform.
// Does nothing in the desktop app or a browser.
(function () {
  var N = window.WoofNative;
  if (!N || window.woof) return;
  var seq = 0, waiting = {}, listeners = { update: [], quit: [] };
  window.__woofResolve = function (id, ok, json) {
    var p = waiting[id]; if (!p) return; delete waiting[id];
    var v = null; try { v = json ? JSON.parse(json) : null; } catch (e) { v = null; }
    if (ok) p.resolve(v); else p.reject(new Error((v && v.error) || 'Something went wrong'));
  };
  window.__woofEvent = function (name, json) {
    var v = null; try { v = json ? JSON.parse(json) : null; } catch (e) { v = null; }
    (listeners[name] || []).forEach(function (cb) { try { cb(v); } catch (e) { /* ignore */ } });
  };
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = String(++seq); waiting[id] = { resolve: resolve, reject: reject };
      N.call(id, method, JSON.stringify(args === undefined ? null : args));
    });
  }
  window.woof = {
    info: function () { return call('info'); },
    auth: {
      status: function () { return call('auth.status'); },
      start: function () { return call('auth.start'); },
      wait: function () { return call('auth.wait'); },
      cancel: function () { return call('auth.cancel'); },
      signOut: function () { return call('auth.signOut'); },
    },
    cloud: {
      session: function () { return call('cloud.session'); },
      sync: function (p) { return call('cloud.sync', p); },
      claim: function (ids) { return call('cloud.claim', ids); },
    },
    open: function (url) { return call('open', url); },
    copy: function (text) { return call('copy', text); },
    checkForUpdate: function () { return call('update.check'); },
    onUpdate: function (cb) { listeners.update.push(cb); N.ready(); },
    restartToUpdate: function () { call('update.install'); },
    onQuit: function (cb) { listeners.quit.push(cb); },
    quitReady: function () { /* Android keeps the app alive; nothing to wait for */ },
  };
})();
