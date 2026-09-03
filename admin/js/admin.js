(function () {
  'use strict';

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var state = { orders: [], products: [], customers: [] };

  var STATUS_LABEL = {
    nuevo: 'Nuevo',
    confirmado: 'Confirmado',
    en_preparacion: 'En preparación',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  };
  var CATEGORY_LABEL = {
    'frutas-congeladas': 'Frutas Congeladas',
    'verduras-congeladas': 'Verduras Congeladas',
    'comidas-congeladas': 'Comidas Congeladas',
    'frutos-secos': 'Frutos Secos',
    'mix-frutos-secos': 'Mix de Frutos Secos',
    'frutas-desecadas': 'Frutas Desecadas',
    'granolas-cereales': 'Granolas y Cereales',
    'harinas-fecula': 'Harinas y Féculas',
    'arroz-fideos': 'Arroz y Fideos',
    'semillas': 'Semillas',
    'legumbres': 'Legumbres',
    'especias': 'Especias',
    'infusiones-bebidas': 'Infusiones y Bebidas',
    'chocolates-confitados': 'Chocolates y Confitados',
    'almacen': 'Almacén',
    'suplementos': 'Suplementos',
    'cosmetica-higiene': 'Cosmética e Higiene Natural',
    'ofertas': 'Ofertas',
  };

  function money(n) { return '$ ' + Number(n || 0).toLocaleString('es-AR'); }
  function dateFmt(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function waLink(phone, text) {
    var digits = String(phone).replace(/[^0-9]/g, '');
    return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function fail(err) {
    console.error(err);
    alert(err && err.message ? err.message : 'Ocurrió un error. Probá de nuevo.');
  }

  // ------------------------------------------------------------- auth ----
  var loginScreen = document.getElementById('loginScreen');
  var adminShell = document.getElementById('adminShell');

  function showApp() {
    loginScreen.style.display = 'none';
    adminShell.classList.add('ready');
    boot();
  }
  function showLogin() {
    adminShell.classList.remove('ready');
    loginScreen.style.display = 'flex';
  }

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPass').value;
    var errorEl = document.getElementById('loginError');
    var btn = document.getElementById('loginBtn');
    errorEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw res.error;
        showApp();
      })
      .catch(function () {
        errorEl.classList.add('show');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(showLogin);
  });

  sb.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showApp();
    else showLogin();
  });

  // -------------------------------------------------------------- fetch --
  function loadAll() {
    return Promise.all([
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('products').select('*').order('name'),
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      if (res[1].error) throw res[1].error;
      state.orders = res[0].data || [];
      state.products = res[1].data || [];
      state.customers = buildCustomers(state.orders);
    });
  }

  function buildCustomers(orders) {
    var map = new Map();
    orders.forEach(function (o) {
      var key = o.customer_phone;
      if (!map.has(key)) {
        map.set(key, { phone: key, name: o.customer_name, address: o.customer_address, orders: 0, total: 0, lastOrderAt: o.created_at });
      }
      var c = map.get(key);
      c.orders += 1;
      c.total += o.total;
      if (o.created_at > c.lastOrderAt) { c.lastOrderAt = o.created_at; c.name = o.customer_name; c.address = o.customer_address; }
    });
    return Array.from(map.values()).sort(function (a, b) { return b.total - a.total; });
  }

  // -------------------------------------------------------------- resumen --
  function renderResumen() {
    var orders = state.orders;
    var revenue = orders.filter(function (o) { return o.status !== 'cancelado'; })
      .reduce(function (s, o) { return s + o.total; }, 0);
    var pending = orders.filter(function (o) { return o.status === 'nuevo' || o.status === 'confirmado' || o.status === 'en_preparacion'; }).length;

    var counts = {};
    orders.forEach(function (o) { (o.items || []).forEach(function (it) { counts[it.name] = (counts[it.name] || 0) + it.qty; }); });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];

    var stats = [
      { label: 'Pedidos totales', value: orders.length, sub: pending + ' en curso' },
      { label: 'Facturación', value: money(revenue), sub: 'sin cancelados' },
      { label: 'Clientes', value: state.customers.length, sub: 'con al menos 1 pedido' },
      { label: 'Producto top', value: top || '—', sub: top ? counts[top] + ' unidades vendidas' : '' }
    ];
    document.getElementById('statRow').innerHTML = stats.map(function (s) {
      return '<div class="stat-card"><div class="label">' + s.label + '</div><div class="value">' + s.value + '</div><div class="sub">' + s.sub + '</div></div>';
    }).join('');

    var recent = orders.slice(0, 6);
    var body = document.getElementById('recentOrdersBody');
    body.innerHTML = recent.length ? recent.map(function (o) {
      return '<tr><td>' + o.id + '</td><td>' + escapeHtml(o.customer_name) + '</td><td>' + money(o.total) + '</td>' +
        '<td><span class="pill pill-' + o.status + '">' + STATUS_LABEL[o.status] + '</span></td><td>' + dateFmt(o.created_at) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">Todavía no hay pedidos.</td></tr>';
  }

  // -------------------------------------------------------------- pedidos --
  function renderPedidos() {
    var filter = document.getElementById('orderFilter').value;
    var list = filter === 'all' ? state.orders : state.orders.filter(function (o) { return o.status === filter; });
    var body = document.getElementById('ordersBody');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">No hay pedidos con ese estado.</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (o) {
      var itemsHtml = (o.items || []).map(function (it) { return '<div>' + it.qty + '× ' + escapeHtml(it.name) + '</div>'; }).join('');
      var msg = 'Hola ' + o.customer_name + '! Te escribimos por tu pedido ' + o.id + ' en ' + window.STORE_NAME + '.';
      return '<tr data-id="' + o.id + '">' +
        '<td>' + o.id + '</td>' +
        '<td>' + escapeHtml(o.customer_name) + '<br><span style="color:var(--ink-400);font-size:.76rem;">' + escapeHtml(o.customer_phone) + '</span></td>' +
        '<td class="order-items">' + itemsHtml + '</td>' +
        '<td>' + money(o.total) + '</td>' +
        '<td>' + statusSelectHtml(o.id, o.status) + '</td>' +
        '<td>' + dateFmt(o.created_at) + '</td>' +
        '<td><a class="mini-btn" target="_blank" rel="noopener" href="' + waLink(o.customer_phone, msg) + '">WhatsApp</a></td>' +
        '</tr>';
    }).join('');
  }
  function statusSelectHtml(id, current) {
    var opts = Object.keys(STATUS_LABEL).map(function (k) {
      return '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' + STATUS_LABEL[k] + '</option>';
    }).join('');
    return '<select class="status-select" data-order="' + id + '">' + opts + '</select>';
  }

  document.getElementById('orderFilter').addEventListener('change', renderPedidos);
  document.getElementById('ordersBody').addEventListener('change', function (e) {
    var sel = e.target.closest('select.status-select');
    if (!sel) return;
    var id = sel.getAttribute('data-order');
    var status = sel.value;
    sb.from('orders').update({ status: status }).eq('id', id).then(function (res) {
      if (res.error) throw res.error;
      var o = state.orders.find(function (x) { return x.id === id; });
      if (o) o.status = status;
      renderResumen();
    }).catch(fail);
  });

  // ------------------------------------------------------------- clientes --
  function renderClientes() {
    var body = document.getElementById('customersBody');
    if (!state.customers.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">Todavía no hay clientes.</td></tr>';
      return;
    }
    body.innerHTML = state.customers.map(function (c) {
      var msg = 'Hola ' + c.name + '! Te escribimos desde ' + window.STORE_NAME + '.';
      return '<tr>' +
        '<td>' + escapeHtml(c.name) + '</td>' +
        '<td>' + escapeHtml(c.phone) + '</td>' +
        '<td>' + escapeHtml(c.address || '—') + '</td>' +
        '<td>' + c.orders + '</td>' +
        '<td>' + money(c.total) + '</td>' +
        '<td>' + dateFmt(c.lastOrderAt) + '</td>' +
        '<td><a class="mini-btn" target="_blank" rel="noopener" href="' + waLink(c.phone, msg) + '">WhatsApp</a></td>' +
        '</tr>';
    }).join('');
  }

  // ------------------------------------------------------------ productos --
  function renderProductos() {
    var body = document.getElementById('productsBody');
    body.innerHTML = state.products.map(function (p) {
      var thumb = p.image
        ? '<img src="/' + p.image + '" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:8px;" onerror="this.style.display=\'none\'">'
        : '';
      return '<tr data-id="' + p.id + '">' +
        '<td>' + thumb + escapeHtml(p.name) + '<br><span style="color:var(--ink-400);font-size:.76rem;">' + p.id + '</span></td>' +
        '<td>' + (CATEGORY_LABEL[p.category] || p.category) + '</td>' +
        '<td>' + escapeHtml(p.unit || '-') + '</td>' +
        '<td><input class="inline-input price-input" type="number" min="0" value="' + p.price + '"></td>' +
        '<td><label class="toggle"><input type="checkbox" class="stock-toggle" ' + (p.stock ? 'checked' : '') + '> En stock</label></td>' +
        '<td><label class="toggle"><input type="checkbox" class="featured-toggle" ' + (p.featured ? 'checked' : '') + '> Destacado</label></td>' +
        '<td><button class="mini-btn danger delete-product">Eliminar</button></td>' +
        '</tr>';
    }).join('');
  }

  document.getElementById('productsBody').addEventListener('change', function (e) {
    var row = e.target.closest('tr[data-id]');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var patch = {};
    if (e.target.classList.contains('price-input')) patch.price = Number(e.target.value) || 0;
    if (e.target.classList.contains('stock-toggle')) patch.stock = e.target.checked;
    if (e.target.classList.contains('featured-toggle')) patch.featured = e.target.checked;
    if (Object.keys(patch).length === 0) return;
    sb.from('products').update(patch).eq('id', id).select().single().then(function (res) {
      if (res.error) throw res.error;
      var idx = state.products.findIndex(function (p) { return p.id === id; });
      if (idx !== -1) state.products[idx] = res.data;
    }).catch(function (err) { fail(err); renderProductos(); });
  });

  document.getElementById('productsBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.delete-product');
    if (!btn) return;
    var row = e.target.closest('tr[data-id]');
    var id = row.getAttribute('data-id');
    var p = state.products.find(function (pp) { return pp.id === id; });
    if (!confirm('¿Eliminar "' + (p ? p.name : id) + '" del catálogo?')) return;
    sb.from('products').delete().eq('id', id).then(function (res) {
      if (res.error) throw res.error;
      state.products = state.products.filter(function (pp) { return pp.id !== id; });
      renderProductos();
      renderResumen();
    }).catch(fail);
  });

  document.getElementById('newProductForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('npName').value.trim();
    var category = document.getElementById('npCategory').value;
    var unit = document.getElementById('npUnit').value.trim() || '-';
    var price = Number(document.getElementById('npPrice').value);
    if (!name || !price) return;
    var id = 'p' + Date.now().toString(36);
    sb.from('products').insert({ id: id, name: name, category: category, unit: unit, price: price, stock: true, featured: false, art: 'nut' })
      .select().single().then(function (res) {
        if (res.error) throw res.error;
        state.products.push(res.data);
        renderProductos();
        e.target.reset();
      }).catch(fail);
  });

  // ------------------------------------------------------------- tab nav --
  document.querySelectorAll('.admin-nav button[data-panel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.admin-nav button[data-panel]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var panel = btn.getAttribute('data-panel');
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      document.getElementById('panel-' + panel).classList.add('active');
    });
  });

  // ------------------------------------------------------------- init ----
  function renderEverything() {
    renderResumen();
    renderPedidos();
    renderClientes();
    renderProductos();
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    loadAll().then(renderEverything).catch(function (err) {
      document.querySelector('.admin-main').innerHTML =
        '<div class="empty-state">No se pudo cargar el panel: ' + escapeHtml(err.message) + '</div>';
    });

    // Pedidos en vivo: si Supabase Realtime está habilitado en la tabla
    // "orders" (el schema.sql lo hace), esto refresca solo apenas entra un
    // pedido nuevo o cambia un estado. Si por algo no llega, el refresco de
    // abajo cada 60s hace de red de seguridad.
    sb.channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function () {
        loadAll().then(renderEverything).catch(function () { /* keep last known state */ });
      })
      .subscribe();

    setInterval(function () {
      loadAll().then(renderEverything).catch(function () { /* keep last known state */ });
    }, 60000);
  }
})();
