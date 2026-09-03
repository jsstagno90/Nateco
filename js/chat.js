(function () {
  'use strict';

  var fab = document.getElementById('chatFab');
  var panel = document.getElementById('chatPanel');
  var closeBtn = document.getElementById('chatClose');
  var body = document.getElementById('chatBody');
  var form = document.getElementById('chatForm');
  var input = document.getElementById('chatInput');
  var sendBtn = form.querySelector('.chat-send');

  var history = [];   // [{role:'user'|'assistant', text}]
  var opened = false;
  var busy = false;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$ ' + Number(n).toLocaleString('es-AR'); }

  function scrollToBottom() { body.scrollTop = body.scrollHeight; }

  function addMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + who;
    div.textContent = text;
    body.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addSuggestions(items) {
    if (!items || !items.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'chat-suggestions';
    items.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'chat-suggest-card';
      card.innerHTML =
        '<span><b>' + escapeHtml(p.name) + '</b><br><span class="chat-suggest-price">' +
        money(p.price) + (p.unit && p.unit !== '-' ? ' · ' + escapeHtml(p.unit) : '') + '</span></span>' +
        '<button type="button" class="chat-suggest-add">Agregar</button>';
      var btn = card.querySelector('.chat-suggest-add');
      btn.addEventListener('click', function () {
        if (!window.NatecoStore) return;
        window.NatecoStore.addToCart(p.id, 1);
        btn.textContent = 'Agregado ✓';
        btn.classList.add('added');
        btn.disabled = true;
      });
      wrap.appendChild(card);
    });
    body.appendChild(wrap);
    scrollToBottom();
  }

  function openPanel() {
    panel.classList.add('open');
    fab.classList.add('hidden');
    if (!opened) {
      opened = true;
      addMsg('¡Hola! Soy el asistente de Nateco. Contame qué estás buscando y te digo si tenemos, con precio — y si querés te lo voy agregando al carrito.', 'bot');
    }
    setTimeout(function () { input.focus(); }, 150);
  }
  function closePanel() {
    panel.classList.remove('open');
    fab.classList.remove('hidden');
  }

  fab.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var text = input.value.trim();
    if (!text) return;

    addMsg(text, 'user');
    history.push({ role: 'user', text: text });
    input.value = '';

    var typing = addMsg('Escribiendo...', 'bot typing');
    busy = true;
    sendBtn.disabled = true;

    var cart = (window.NatecoStore ? window.NatecoStore.getCartItems() : [])
      .map(function (it) { return { id: it.id, qty: it.qty }; });

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(0, -1), cart: cart })
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        typing.remove();
        var data = r.data || {};

        if (Array.isArray(data.cart_actions) && data.cart_actions.length && window.NatecoStore) {
          data.cart_actions.forEach(function (a) {
            window.NatecoStore.addToCart(a.id, a.qty);
          });
        }

        var replyText = data.reply || 'No pude entenderte bien, ¿me lo repetís?';
        addMsg(replyText, r.ok ? 'bot' : 'bot error');
        history.push({ role: 'assistant', text: replyText });

        addSuggestions(data.suggested);
      })
      .catch(function () {
        typing.remove();
        addMsg('No pude conectarme con el asistente. Probá de nuevo en un rato.', 'bot error');
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
      });
  });
})();
