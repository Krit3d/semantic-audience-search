/* Minimal runtime for the exported Collabrama landing.
   Renders the <template id="tpl"> with {{holes}}, <sc-for>, <sc-if> and on* handlers,
   then patches the live DOM with morphdom so running CSS animations are kept. */
(function () {
  'use strict';
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var EVENTS = { onclick: 'click', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onfocus: 'focus', onanimationend: 'animationend' };

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lookup(scope, expr) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var parts = expr.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, e) {
      var v = lookup(scope, e);
      return v == null ? '' : String(v);
    });
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state) : patch;
    for (var k in p) this.state[k] = p[k];
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };
  window.DCLogic = DCLogic;

  window.mountDC = function (Component, props, root, tpl) {
    var comp = new Component(props);
    if (!comp.state) comp.state = {};
    var handlers = {}, hid = 0, ifId = 0, queued = false, mounted = false;

    function renderNodes(nodes, scope, path) {
      var out = '';
      for (var i = 0; i < nodes.length; i++) out += renderNode(nodes[i], scope, path + '.' + i);
      return out;
    }
    function renderNode(node, scope, path) {
      if (node.nodeType === 3) return esc(interp(node.nodeValue, scope));
      if (node.nodeType !== 1) return '';
      var tag = node.localName;
      if (tag === 'sc-for') {
        var list = lookup(scope, (node.getAttribute('list') || '').replace(/[{}]/g, '')) || [];
        var as = node.getAttribute('as') || 'item';
        var s = '';
        for (var j = 0; j < list.length; j++) {
          var sub = Object.create(scope);
          sub[as] = list[j];
          sub.$index = j;
          s += renderNodes(node.childNodes, sub, path + '[' + j + ']');
        }
        return s;
      }
      if (tag === 'sc-if') {
        var cond = lookup(scope, (node.getAttribute('value') || '').replace(/[{}]/g, ''));
        if (!cond) return '';
        return '<sc-if id="k' + path.replace(/[^\w]/g, '_') + '" style="display: contents">' + renderNodes(node.childNodes, scope, path) + '</sc-if>';
      }
      var attrs = '';
      for (var a = 0; a < node.attributes.length; a++) {
        var at = node.attributes[a], name = at.name, val = at.value;
        if (name.indexOf('hint-') === 0) continue;
        var ev = EVENTS[name.toLowerCase()];
        if (ev) {
          var m = WHOLE.exec(val);
          var fn = m && lookup(scope, m[1]);
          if (typeof fn === 'function') {
            var id = 'h' + (hid++);
            handlers[id] = fn;
            attrs += ' data-on-' + ev + '="' + id + '"';
          }
          continue;
        }
        var whole = WHOLE.exec(val);
        var out = whole ? lookup(scope, whole[1]) : interp(val, scope);
        if (out === undefined || out === null) continue;
        attrs += ' ' + name + '="' + esc(out) + '"';
      }
      if (VOID[tag]) return '<' + tag + attrs + '>';
      return '<' + tag + attrs + '>' + renderNodes(node.childNodes, scope, path) + '</' + tag + '>';
    }

    function render() {
      queued = false;
      handlers = {}; hid = 0;
      var vals = comp.renderVals();
      var html = renderNodes(tpl.content.childNodes, vals, 'r');
      var next = document.createElement('div');
      next.innerHTML = html;
      morphdom(root, next, { childrenOnly: true });
      if (mounted && comp.componentDidUpdate) comp.componentDidUpdate();
    }
    comp.__schedule = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(render);
    };

    function find(el, ev, bubble) {
      while (el && el !== root.parentNode) {
        if (el.getAttribute && el.getAttribute('data-on-' + ev)) return el;
        if (!bubble) return null;
        el = el.parentNode;
      }
      return null;
    }
    function bind(ev, bubble, capture) {
      root.addEventListener(ev, function (e) {
        var el = find(e.target, ev, bubble);
        if (!el) return;
        var fn = handlers[el.getAttribute('data-on-' + ev)];
        if (fn) fn(e);
      }, capture);
    }
    bind('click', true, false);
    bind('mouseenter', false, true);
    bind('mouseleave', false, true);
    bind('focus', false, true);
    bind('animationend', false, false);

    render();
    mounted = true;
    if (comp.componentDidMount) comp.componentDidMount();
    return comp;
  };
})();
