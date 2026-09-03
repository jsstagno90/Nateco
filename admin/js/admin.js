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
  function productSalesStats(orders) {
    var byName = {};
    (orders || state.orders).forEach(function (o) {
      if (o.status === 'cancelado') return;
      (o.items || []).forEach(function (it) {
        if (!byName[it.name]) byName[it.name] = { qty: 0, revenue: 0 };
        byName[it.name].qty += it.qty;
        byName[it.name].revenue += it.price * it.qty;
      });
    });
    return byName;
  }

  // ---------------------------------------------------------- date filter --
  function selectedDateRange() {
    var selectEl = document.getElementById('dateRangeSelect');
    var mode = selectEl ? selectEl.value : 'month';
    var now = new Date();
    var end = new Date(now);
    end.setHours(23, 59, 59, 999);
    var start;
    if (mode === 'today') {
      start = new Date(now); start.setHours(0, 0, 0, 0);
    } else if (mode === 'week') {
      start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    } else if (mode === 'year') {
      start = new Date(now); start.setDate(start.getDate() - 364); start.setHours(0, 0, 0, 0);
    } else if (mode === 'custom') {
      var fromEl = document.getElementById('dateFrom');
      var toEl = document.getElementById('dateTo');
      var fromVal = fromEl && fromEl.value;
      var toVal = toEl && toEl.value;
      start = fromVal ? new Date(fromVal + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      end = toVal ? new Date(toVal + 'T23:59:59.999') : end;
    } else { // 'month' (default)
      start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
    }
    if (start > end) { var tmp = start; start = end; end = tmp; }
    var totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    var bucket = totalDays <= 31 ? 'day' : (totalDays <= 180 ? 'week' : 'month');
    return { mode: mode, start: start, end: end, totalDays: totalDays, bucket: bucket };
  }

  var DATE_RANGE_LABEL = { today: 'Último día', week: 'Última semana', month: 'Último mes', year: 'Último año', custom: 'Rango personalizado' };

  function filteredOrders(range) {
    range = range || selectedDateRange();
    var s = range.start.getTime(), e = range.end.getTime();
    return state.orders.filter(function (o) {
      var t = new Date(o.created_at).getTime();
      return t >= s && t <= e;
    });
  }

  function customersInOrders(orders) {
    var seen = {};
    var count = 0;
    orders.forEach(function (o) {
      if (!seen[o.customer_phone]) { seen[o.customer_phone] = true; count += 1; }
    });
    return count;
  }

  function salesSeries(orders, range) {
    var msDay = 86400000;
    var bucket = range.bucket;

    function dayKey(date) { return date.toISOString().slice(0, 10); }
    function monthKey(date) { return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2); }
    function weekKey(date) {
      var d = new Date(date);
      var dow = (d.getDay() + 6) % 7; // 0 = Monday
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - dow);
      return dayKey(d);
    }
    var keyFn = bucket === 'month' ? monthKey : (bucket === 'week' ? weekKey : dayKey);

    function labelFor(key) {
      if (bucket === 'month') {
        var parts = key.split('-');
        var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
        return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
      }
      var d2 = new Date(key + 'T00:00:00');
      return d2.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    }

    var keys = [];
    var map = {};
    var cursor = new Date(range.start);
    var guard = 0;
    while (cursor.getTime() <= range.end.getTime() && guard < 400) {
      var k = keyFn(cursor);
      if (!map.hasOwnProperty(k)) { keys.push(k); map[k] = 0; }
      cursor = new Date(cursor.getTime() + msDay);
      guard += 1;
    }
    orders.forEach(function (o) {
      if (o.status === 'cancelado') return;
      var k = keyFn(new Date(o.created_at));
      if (map.hasOwnProperty(k)) map[k] += o.total;
    });
    return { labels: keys.map(labelFor), data: keys.map(function (k) { return map[k]; }) };
  }

  function ordersByStatus(orders) {
    var counts = {};
    Object.keys(STATUS_LABEL).forEach(function (k) { counts[k] = 0; });
    (orders || state.orders).forEach(function (o) { if (counts.hasOwnProperty(o.status)) counts[o.status] += 1; });
    return counts;
  }

  var charts = { sales: null, status: null, topProducts: null };

  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    var range = selectedDateRange();
    var periodOrders = filteredOrders(range);

    var subEl = document.getElementById('salesChartSub');
    if (subEl) {
      if (range.mode === 'custom') {
        var fmt = function (d) { return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
        subEl.textContent = fmt(range.start) + ' – ' + fmt(range.end);
      } else {
        subEl.textContent = DATE_RANGE_LABEL[range.mode] || 'Último mes';
      }
    }

    var salesData = salesSeries(periodOrders, range);
    if (charts.sales) charts.sales.destroy();
    charts.sales = new Chart(document.getElementById('salesChart').getContext('2d'), {
      type: 'bar',
      data: { labels: salesData.labels, datasets: [{ label: 'Ventas', data: salesData.data, backgroundColor: '#8f3a6c', borderRadius: 6, maxBarThickness: 26 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return money(ctx.parsed.y); } } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function (v) { return money(v); } }, grid: { color: '#e7dccb' } },
          x: { grid: { display: false } }
        }
      }
    });

    var statusCounts = ordersByStatus(periodOrders);
    var statusKeys = Object.keys(STATUS_LABEL);
    var statusColors = { nuevo: '#3b4b9e', confirmado: '#6f8f56', en_preparacion: '#c98a2d', entregado: '#3f6b2b', cancelado: '#a4342a' };
    if (charts.status) charts.status.destroy();
    charts.status = new Chart(document.getElementById('statusChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: statusKeys.map(function (k) { return STATUS_LABEL[k]; }),
        datasets: [{ data: statusKeys.map(function (k) { return statusCounts[k]; }), backgroundColor: statusKeys.map(function (k) { return statusColors[k]; }), borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
      }
    });

    var sales = productSalesStats(periodOrders);
    var top = Object.keys(sales).map(function (name) { return { name: name, qty: sales[name].qty }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 10);
    if (charts.topProducts) charts.topProducts.destroy();
    charts.topProducts = new Chart(document.getElementById('topProductsChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(function (e) { return e.name.length > 28 ? e.name.slice(0, 26) + '…' : e.name; }),
        datasets: [{ label: 'Unidades', data: top.map(function (e) { return e.qty; }), backgroundColor: '#7a2d5c', borderRadius: 6, maxBarThickness: 16 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: '#e7dccb' } }, y: { grid: { display: false } } }
      }
    });
  }

  function rankingRows() {
    var periodOrders = filteredOrders();
    var periodSales = productSalesStats(periodOrders);
    var lifetimeSales = productSalesStats(state.orders);
    var searchEl = document.getElementById('rankingSearch');
    var sortEl = document.getElementById('rankingSort');
    var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var sort = sortEl ? sortEl.value : 'sold_desc';

    var rows = state.products.map(function (p) {
      var s = periodSales[p.name] || { qty: 0, revenue: 0 };
      var lifetimeSold = lifetimeSales[p.name] ? lifetimeSales[p.name].qty : 0;
      var stockQty = p.stock_qty != null ? p.stock_qty : 100;
      return { product: p, sold: s.qty, revenue: s.revenue, remaining: stockQty - lifetimeSold };
    });

    if (q) {
      rows = rows.filter(function (r) {
        return r.product.name.toLowerCase().indexOf(q) !== -1 ||
          (CATEGORY_LABEL[r.product.category] || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    rows.sort(function (a, b) {
      if (sort === 'sold_asc') return a.sold - b.sold;
      if (sort === 'stock_asc') return a.remaining - b.remaining;
      if (sort === 'revenue_desc') return b.revenue - a.revenue;
      return b.sold - a.sold;
    });

    return rows;
  }

  function renderRanking() {
    var body = document.getElementById('rankingBody');
    var rows = rankingRows();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No encontramos productos con esa búsqueda.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      var p = r.product;
      var stockClass = r.remaining <= 0 ? 'stock-bad' : (r.remaining <= 20 ? 'stock-warn' : 'stock-ok');
      var stockLabel = r.remaining <= 0 ? 'Sin stock' : r.remaining + ' u.';
      return '<tr>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + (CATEGORY_LABEL[p.category] || p.category) + '</td>' +
        '<td>' + r.sold + '</td>' +
        '<td>' + money(r.revenue) + '</td>' +
        '<td><span class="stock-pill ' + stockClass + '">' + stockLabel + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function renderResumen() {
    var range = selectedDateRange();
    var orders = filteredOrders(range);
    var validOrders = orders.filter(function (o) { return o.status !== 'cancelado'; });
    var revenue = validOrders.reduce(function (s, o) { return s + o.total; }, 0);
    var pending = orders.filter(function (o) { return o.status === 'nuevo' || o.status === 'confirmado' || o.status === 'en_preparacion'; }).length;
    var avgTicket = validOrders.length ? Math.round(revenue / validOrders.length) : 0;
    var periodLabel = range.mode === 'custom' ? 'en el período' : DATE_RANGE_LABEL[range.mode].toLowerCase();

    // El stock siempre se calcula con TODO el historial de ventas (no con el
    // período elegido), porque lo que queda en depósito no depende del filtro.
    var lifetimeSales = productSalesStats(state.orders);
    var totalStock = 0, lowStockCount = 0;
    state.products.forEach(function (p) {
      var stockQty = p.stock_qty != null ? p.stock_qty : 100;
      var sold = lifetimeSales[p.name] ? lifetimeSales[p.name].qty : 0;
      totalStock += Math.max(0, stockQty - sold);
      if (stockQty - sold <= 20) lowStockCount += 1;
    });

    var stats = [
      { label: 'Facturación', value: money(revenue), sub: periodLabel + ', sin cancelados' },
      { label: 'Pedidos', value: orders.length, sub: pending + ' en curso' },
      { label: 'Ticket promedio', value: money(avgTicket), sub: 'por pedido' },
      { label: 'Clientes', value: customersInOrders(orders), sub: periodLabel },
      { label: 'Stock restante', value: totalStock, sub: 'unidades, histórico' },
      { label: 'Stock bajo', value: lowStockCount, sub: '≤ 20 unidades' }
    ];
    document.getElementById('statRow').innerHTML = stats.map(function (s) {
      return '<div class="stat-card"><div class="label">' + s.label + '</div><div class="value">' + s.value + '</div><div class="sub">' + s.sub + '</div></div>';
    }).join('');

    var recent = orders.slice(0, 6);
    var body = document.getElementById('recentOrdersBody');
    body.innerHTML = recent.length ? recent.map(function (o) {
      return '<tr><td>' + o.id + '</td><td>' + escapeHtml(o.customer_name) + '</td><td>' + money(o.total) + '</td>' +
        '<td><span class="pill pill-' + o.status + '">' + STATUS_LABEL[o.status] + '</span></td><td>' + dateFmt(o.created_at) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">No hay pedidos en este período.</td></tr>';

    renderCharts();
    renderRanking();
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
  function categoryOptionsHtml(selected) {
    return Object.keys(CATEGORY_LABEL).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + CATEGORY_LABEL[k] + '</option>';
    }).join('');
  }

  function filteredProducts() {
    var input = document.getElementById('productSearch');
    var q = input ? input.value.trim().toLowerCase() : '';
    if (!q) return state.products;
    return state.products.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) !== -1 || p.id.toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderProductos() {
    var body = document.getElementById('productsBody');
    var list = filteredProducts();
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="9" class="empty-state">No encontramos productos con esa búsqueda.</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (p) {
      var thumb = p.image
        ? '<img src="/' + p.image + '" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:8px;" onerror="this.style.display=\'none\'">'
        : '';
      return '<tr data-id="' + p.id + '">' +
        '<td><input class="inline-input code-input" type="text" value="' + escapeHtml(p.id) + '"></td>' +
        '<td>' + thumb + '<input class="inline-input name-input" type="text" value="' + escapeHtml(p.name) + '"></td>' +
        '<td><select class="inline-select category-select">' + categoryOptionsHtml(p.category) + '</select></td>' +
        '<td>' + escapeHtml(p.unit || '-') + '</td>' +
        '<td><input class="inline-input price-input" type="number" min="0" value="' + p.price + '"></td>' +
        '<td><input class="inline-input qty-input" type="number" min="0" value="' + (p.stock_qty != null ? p.stock_qty : 0) + '"></td>' +
        '<td><label class="toggle"><input type="checkbox" class="stock-toggle" ' + (p.stock ? 'checked' : '') + '> En stock</label></td>' +
        '<td><label class="toggle"><input type="checkbox" class="featured-toggle" ' + (p.featured ? 'checked' : '') + '> Destacado</label></td>' +
        '<td><button class="mini-btn danger delete-product">Eliminar</button></td>' +
        '</tr>';
    }).join('');
  }

  var productSearchEl = document.getElementById('productSearch');
  if (productSearchEl) productSearchEl.addEventListener('input', renderProductos);

  var rankingSearchEl = document.getElementById('rankingSearch');
  var rankingSortEl = document.getElementById('rankingSort');
  if (rankingSearchEl) rankingSearchEl.addEventListener('input', renderRanking);
  if (rankingSortEl) rankingSortEl.addEventListener('change', renderRanking);

  // ------------------------------------------------------- filtro de fecha --
  var dateRangeSelectEl = document.getElementById('dateRangeSelect');
  var dateCustomRangeEl = document.getElementById('dateCustomRange');
  var dateFromEl = document.getElementById('dateFrom');
  var dateToEl = document.getElementById('dateTo');

  function toggleCustomRange() {
    if (!dateRangeSelectEl || !dateCustomRangeEl) return;
    var isCustom = dateRangeSelectEl.value === 'custom';
    dateCustomRangeEl.hidden = !isCustom;
    if (isCustom && dateFromEl && dateToEl && !dateFromEl.value && !dateToEl.value) {
      var today = new Date();
      var monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 29);
      dateToEl.value = today.toISOString().slice(0, 10);
      dateFromEl.value = monthAgo.toISOString().slice(0, 10);
    }
  }

  if (dateRangeSelectEl) {
    dateRangeSelectEl.addEventListener('change', function () { toggleCustomRange(); renderResumen(); });
  }
  if (dateFromEl) dateFromEl.addEventListener('change', renderResumen);
  if (dateToEl) dateToEl.addEventListener('change', renderResumen);

  document.getElementById('productsBody').addEventListener('change', function (e) {
    var row = e.target.closest('tr[data-id]');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var current = state.products.find(function (p) { return p.id === id; });
    var patch = {};

    if (e.target.classList.contains('code-input')) {
      var newId = e.target.value.trim();
      if (!newId) { alert('El código no puede quedar vacío.'); e.target.value = id; return; }
      if (newId !== id && state.products.some(function (p) { return p.id === newId; })) {
        alert('Ya existe un producto con el código "' + newId + '".');
        e.target.value = id;
        return;
      }
      if (newId !== id) patch.id = newId;
    }
    if (e.target.classList.contains('name-input')) {
      var newName = e.target.value.trim();
      if (!newName) { alert('El nombre no puede quedar vacío.'); e.target.value = current ? current.name : ''; return; }
      patch.name = newName;
    }
    if (e.target.classList.contains('category-select')) patch.category = e.target.value;
    if (e.target.classList.contains('price-input')) patch.price = Number(e.target.value) || 0;
    if (e.target.classList.contains('qty-input')) patch.stock_qty = Number(e.target.value) || 0;
    if (e.target.classList.contains('stock-toggle')) patch.stock = e.target.checked;
    if (e.target.classList.contains('featured-toggle')) patch.featured = e.target.checked;
    if (Object.keys(patch).length === 0) return;

    sb.from('products').update(patch).eq('id', id).select().single().then(function (res) {
      if (res.error) throw res.error;
      var idx = state.products.findIndex(function (p) { return p.id === id; });
      if (idx !== -1) state.products[idx] = res.data;
      if (patch.id && patch.id !== id) row.setAttribute('data-id', res.data.id);
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
    var stockQty = Number(document.getElementById('npStockQty').value) || 0;
    if (!name || !price) return;
    var id = 'p' + Date.now().toString(36);
    sb.from('products').insert({ id: id, name: name, category: category, unit: unit, price: price, stock_qty: stockQty, stock: true, featured: false, art: 'nut' })
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
