(function () {
  'use strict';

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var state = {
    products: [],
    cart: {},      // id -> qty
    category: 'all',
    search: ''
  };

  var CART_KEY = 'nateco_cart_v1';

  // ---------------------------------------------------------------- icons --
  function iconFor(art) {
    switch (art) {
      case 'berry': return '<div class="card-art art-berry">' + svgBerry() + '</div>';
      case 'herb': return '<div class="card-art art-herb">' + svgHerb() + '</div>';
      case 'supp': return '<div class="card-art art-supp">' + svgSupp() + '</div>';
      default: return '<div class="card-art art-nut">' + svgNut() + '</div>';
    }
  }
  function mediaFor(p) {
    if (p && p.image) {
      return '<div class="card-art card-photo"><img src="/' + p.image +
        '" alt="" loading="lazy" data-art="' + (p.art || 'nut') +
        '" onerror="window.__natecoImgFallback(this)"></div>';
    }
    return iconFor(p ? p.art : 'nut');
  }
  window.__natecoImgFallback = function (img) {
    var art = img.getAttribute('data-art') || 'nut';
    var wrap = img.parentNode;
    if (wrap && wrap.parentNode) {
      wrap.outerHTML = iconFor(art);
    }
  };
  function svgBerry() { return '<svg viewBox="0 0 64 64" fill="none" stroke="var(--purple-700)" stroke-width="2"><circle cx="22" cy="30" r="10"/><circle cx="40" cy="24" r="8"/><circle cx="38" cy="42" r="9"/><path d="M22 20V10M40 16V10M38 33v-8" stroke="var(--green-500)"/></svg>'; }
  function svgNut() { return '<svg viewBox="0 0 64 64" fill="none" stroke="var(--brown-500)" stroke-width="2"><path d="M32 8c-9 0-15 8-15 20 0 14 8 24 15 28 7-4 15-14 15-28 0-12-6-20-15-20Z"/><path d="M24 26h16M22 34h20"/></svg>'; }
  function svgHerb() { return '<svg viewBox="0 0 64 64" fill="none" stroke="var(--green-500)" stroke-width="2"><path d="M32 54V22"/><path d="M32 30c0-10-8-16-18-16 0 11 8 18 18 18Zm0-4c0-9 8-15 18-15 0 10-8 17-18 17Z"/></svg>'; }
  function svgSupp() { return '<svg viewBox="0 0 64 64" fill="none" stroke="var(--purple-700)" stroke-width="2"><rect x="20" y="10" width="24" height="44" rx="8"/><path d="M20 28h24"/></svg>'; }

  function money(n) { return '$ ' + Number(n).toLocaleString('es-AR'); }

  // -------------------------------------------------------------- storage --
  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      state.cart = raw ? JSON.parse(raw) : {};
    } catch (e) { state.cart = {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- data --
  function loadProducts() {
    return sb.from('products').select('*').order('name').then(function (res) {
      if (res.error) throw res.error;
      state.products = res.data || [];
    });
  }

  // ---------------------------------------------------------------- view --
  var catLabels = {
    all: ['Destacados de la semana', 'Lo más pedido por WhatsApp esta semana en Bariloche.'],
    'frutas-congeladas': ['Frutas Congeladas', ''],
    'verduras-congeladas': ['Verduras Congeladas', ''],
    'comidas-congeladas': ['Comidas Congeladas', ''],
    'frutos-secos': ['Frutos Secos', ''],
    'mix-frutos-secos': ['Mix de Frutos Secos', ''],
    'frutas-desecadas': ['Frutas Desecadas', ''],
    'granolas-cereales': ['Granolas y Cereales', ''],
    'harinas-fecula': ['Harinas y Féculas', ''],
    'arroz-fideos': ['Arroz y Fideos', ''],
    'semillas': ['Semillas', ''],
    'legumbres': ['Legumbres', ''],
    'especias': ['Especias', ''],
    'infusiones-bebidas': ['Infusiones y Bebidas', ''],
    'chocolates-confitados': ['Chocolates y Confitados', ''],
    'almacen': ['Almacén', ''],
    'suplementos': ['Suplementos', ''],
    'cosmetica-higiene': ['Cosmética e Higiene Natural', ''],
    'ofertas': ['Ofertas', ''],
  };

  function visibleProducts() {
    // La búsqueda siempre mira TODO el catálogo, sin importar qué
    // categoría esté seleccionada (si no, buscar "frutilla" estando en
    // "Cosmética" no encontraba nada aunque el producto existiera en
    // "Frutas Congeladas").
    if (state.search.trim()) {
      var q = state.search.trim().toLowerCase();
      return state.products.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; });
    }
    var list = state.products;
    if (state.category === 'all') list = list.filter(function (p) { return p.featured; });
    else list = list.filter(function (p) { return p.category === state.category; });
    return list;
  }

  function renderHead() {
    var labels = catLabels[state.category] || catLabels.all;
    document.getElementById('catalogTitle').textContent = state.search
      ? 'Resultados para "' + state.search + '"'
      : labels[0];
    document.getElementById('catalogSub').textContent = state.search ? '' : labels[1];
  }

  function renderGrid() {
    renderHead();
    var list = visibleProducts();
    var grid = document.getElementById('productGrid');
    if (list.length === 0) {
      grid.innerHTML = '<p style="color:var(--ink-400)">No encontramos productos en esta categoría.</p>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
  }

  function cardHtml(p) {
    var qty = state.cart[p.id] || 0;
    var stockOut = !p.stock;
    return '' +
      '<div class="card" data-id="' + p.id + '">' +
      mediaFor(p) +
      (stockOut ? '<span class="badge-stock">Sin stock</span>' : '') +
      '<h3>' + escapeHtml(p.name) + '</h3>' +
      (p.unit && p.unit !== '-' ? '<div class="unit">' + escapeHtml(p.unit) + '</div>' : '') +
      '<div class="price-row">' +
      '<span class="price">' + (p.desde ? '<small>Desde</small>' : '') + money(p.price) + '</span>' +
      (stockOut ? '<span class="out-btn">Avisame</span>' : stepperHtml(p.id, qty)) +
      '</div>' +
      '</div>';
  }
  function stepperHtml(id, qty) {
    return '<div class="stepper" data-id="' + id + '">' +
      '<button class="dec" aria-label="Quitar">–</button>' +
      '<span>' + qty + '</span>' +
      '<button class="inc" aria-label="Agregar">+</button>' +
      '</div>';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------- cart --
  function cartItems() {
    var items = [];
    Object.keys(state.cart).forEach(function (id) {
      var qty = state.cart[id];
      if (!qty) return;
      var p = state.products.find(function (pp) { return pp.id === id; });
      if (p) items.push({ id: p.id, name: p.name, price: p.price, qty: qty, unit: p.unit });
    });
    return items;
  }
  function cartCount() {
    return Object.values(state.cart).reduce(function (a, b) { return a + b; }, 0);
  }
  function cartTotal() {
    return cartItems().reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);
  }

  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id];
    else state.cart[id] = qty;
    saveCart();
    renderAll();
  }

  function renderCart() {
    document.getElementById('cartCount').textContent = cartCount();
    var body = document.getElementById('cartBody');
    var items = cartItems();
    if (items.length === 0) {
      body.innerHTML = '<p class="drawer-empty">Todavía no agregaste productos.</p>';
    } else {
      body.innerHTML = items.map(function (it) {
        var p = state.products.find(function (pp) { return pp.id === it.id; });
        return '' +
          '<div class="cart-line">' +
          mediaFor(p).replace('card-art', 'card-art ci-art') +
          '<div class="ci-info">' +
          '<h4>' + escapeHtml(it.name) + '</h4>' +
          '<div class="ci-price">' + it.qty + ' × ' + money(it.price) + ' = ' + money(it.qty * it.price) + '</div>' +
          '<button class="ci-remove" data-id="' + it.id + '">Quitar</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }
    document.getElementById('cartTotal').textContent = money(cartTotal());
    document.getElementById('checkoutBtn').disabled = items.length === 0;
  }

  function renderAll() {
    renderGrid();
    renderCart();
  }

  // -------------------------------------------------------------- drawer --
  var overlay = document.getElementById('overlay');
  var drawer = document.getElementById('cartDrawer');
  function openDrawer() { overlay.classList.add('open'); drawer.classList.add('open'); }
  function closeDrawer() { overlay.classList.remove('open'); drawer.classList.remove('open'); }

  document.getElementById('cartOpenBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', function () { closeDrawer(); closeModal(); });

  // -------------------------------------------------------------- modal ---
  var modalOverlay = document.getElementById('modalOverlay');
  function openModal() { modalOverlay.classList.add('open'); }
  function closeModal() { modalOverlay.classList.remove('open'); document.getElementById('formError').classList.remove('show'); }

  document.getElementById('checkoutBtn').addEventListener('click', openModal);
  document.getElementById('footerWhatsBtn').addEventListener('click', function () {
    if (cartItems().length === 0) { openDrawer(); }
    else { openModal(); }
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);

  document.getElementById('modalConfirm').addEventListener('click', function () {
    var name = document.getElementById('custName').value.trim();
    var phone = document.getElementById('custPhone').value.trim();
    var address = document.getElementById('custAddress').value.trim();
    var note = document.getElementById('custNote').value.trim();
    var errorEl = document.getElementById('formError');

    if (!name || !phone) {
      errorEl.textContent = 'Completá nombre y teléfono para continuar.';
      errorEl.classList.add('show');
      return;
    }
    errorEl.classList.remove('show');

    var items = cartItems();
    var row = {
      items: items.map(function (it) { return { id: it.id, name: it.name, price: it.price, qty: it.qty }; }),
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      customer_note: note
    };

    var btn = document.getElementById('modalConfirm');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    sb.rpc('create_order', {
      p_items: row.items,
      p_customer_name: row.customer_name,
      p_customer_phone: row.customer_phone,
      p_customer_address: row.customer_address,
      p_customer_note: row.customer_note
    })
      .then(function (res) {
        if (res.error) throw res.error;
        var result = res.data && res.data[0];
        if (!result) throw new Error('sin resultado');
        sendToWhatsApp(Object.assign({}, row, result));
        state.cart = {};
        saveCart();
        renderAll();
        closeModal();
        closeDrawer();
        document.getElementById('custName').value = '';
        document.getElementById('custPhone').value = '';
        document.getElementById('custAddress').value = '';
        document.getElementById('custNote').value = '';
      })
      .catch(function () {
        errorEl.textContent = 'Hubo un problema al enviar el pedido. Probá de nuevo.';
        errorEl.classList.add('show');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Confirmar y enviar';
      });
  });

  function sendToWhatsApp(order) {
    var lines = [];
    lines.push('Pedido ' + window.STORE_NAME + ' #' + order.id);
    lines.push('');
    order.items.forEach(function (it) {
      lines.push('• ' + it.name + '  x' + it.qty + '  —  ' + money(it.price * it.qty));
    });
    lines.push('');
    lines.push('Total: *' + money(order.total) + '*');
    lines.push('');
    lines.push('Para confirmar tu pedido, transferí el total a:');
    lines.push('Alias: *' + window.PAYMENT_ALIAS + '*');
    lines.push('');
    lines.push('Cuando se acredite el pago, tu pedido queda confirmado. ¡Gracias por tu compra!');
    lines.push('');
    lines.push('Cliente: ' + order.customer_name);
    lines.push('Tel: ' + order.customer_phone);
    if (order.customer_address) lines.push('Dirección: ' + order.customer_address);
    if (order.customer_note) lines.push('Nota: ' + order.customer_note);

    var text = encodeURIComponent(lines.join('\n'));
    var url = 'https://wa.me/' + window.WHATSAPP_NUMBER + '?text=' + text;
    window.open(url, '_blank');
  }

  // --------------------------------------------------------- interactions --
  document.getElementById('productGrid').addEventListener('click', function (e) {
    var inc = e.target.closest('.stepper .inc');
    var dec = e.target.closest('.stepper .dec');
    if (inc || dec) {
      var wrap = e.target.closest('.stepper');
      var id = wrap.getAttribute('data-id');
      var current = state.cart[id] || 0;
      setQty(id, inc ? current + 1 : Math.max(0, current - 1));
    }
  });

  document.getElementById('cartBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.ci-remove');
    if (btn) setQty(btn.getAttribute('data-id'), 0);
  });

  document.getElementById('catsRow').addEventListener('click', function (e) {
    var chip = e.target.closest('.cat-chip');
    if (!chip) return;
    document.querySelectorAll('.cat-chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.category = chip.getAttribute('data-cat');
    state.search = '';
    document.getElementById('searchInput').value = '';
    renderAll();
  });

  var searchTimer;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var val = e.target.value;
    searchTimer = setTimeout(function () {
      state.search = val;
      renderAll();
    }, 150);
  });

  // -------------------------------------------------------------- init ----
  loadCart();
  loadProducts().then(renderAll).catch(function (err) {
    console.error(err);
    document.getElementById('productGrid').innerHTML =
      '<p style="color:var(--ink-400)">No pudimos cargar los productos. Revisá la configuración de Supabase en js/supabase-config.js.</p>';
  });
})();
