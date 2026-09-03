// api/chat.js
// ---------------------------------------------------------------------------
// Endpoint del chatbot de compras. Recibe un mensaje del cliente, arma el
// catálogo actual de productos desde Supabase, se lo manda a Gemini junto
// con la conversación y el carrito actual, y devuelve una respuesta lista
// para mostrar en el chat (y, si corresponde, productos para agregar al
// carrito o para sugerir).
//
// La GEMINI_API_KEY se lee de una variable de entorno de Vercel — NUNCA va
// escrita acá en el código. Configurala en:
// Vercel → tu proyecto → Settings → Environment Variables → GEMINI_API_KEY
// (conseguila gratis en https://aistudio.google.com/apikey).
// ---------------------------------------------------------------------------

// Mismos valores públicos que js/supabase-config.js: la anon key de
// Supabase está pensada para ser pública, la seguridad la dan las
// políticas RLS de supabase/schema.sql, no el secreto de esta clave.
var SUPABASE_URL = 'https://zglyazqdjnzitxbmyioz.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnbHlhenFkam56aXR4Ym15aW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU4NDksImV4cCI6MjEwMzg0MTg0OX0.8xRETq0dDmQWs8F-jagDDiE-RT1a6uI3xQjEW260eV0';

// Si el día de mañana Gemini saca un modelo más nuevo, este es el único
// lugar que hay que tocar.
var GEMINI_MODEL = 'gemini-2.5-flash';

var CATEGORY_NAMES = {
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
  'ofertas': 'Ofertas'
};

var RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    cart_actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          qty: { type: 'integer' }
        },
        required: ['id', 'qty']
      }
    },
    suggested_ids: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['reply', 'cart_actions', 'suggested_ids']
};

function fetchCatalog() {
  var url = SUPABASE_URL + '/rest/v1/products?select=id,name,category,unit,price,stock,stock_qty';
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }
  }).then(function (res) {
    if (!res.ok) throw new Error('No se pudo leer el catálogo (' + res.status + ')');
    return res.json();
  });
}

function catalogToText(products) {
  return products.map(function (p) {
    var stockQty = p.stock ? (p.stock_qty == null ? '?' : p.stock_qty) : 0;
    var cat = CATEGORY_NAMES[p.category] || p.category;
    var unit = p.unit && p.unit !== '-' ? p.unit : '';
    return p.id + ' | ' + p.name + ' | ' + unit + ' | ' + cat + ' | $' + p.price + ' | stock: ' + stockQty;
  }).join('\n');
}

function buildSystemPrompt(catalogText, cartText) {
  return [
    'Sos el asistente de compras de Nateco, un almacén natural de San Carlos de Bariloche que vende por WhatsApp y por esta tienda online.',
    'Hablás como alguien atendiendo el local: cercano, con "vos", respuestas cortas (2 a 4 líneas como mucho), sin emojis de más.',
    '',
    'CATÁLOGO ACTUAL (id | nombre | presentación | categoría | precio | stock disponible):',
    catalogText,
    '',
    'CARRITO ACTUAL DEL CLIENTE:',
    cartText || '(vacío)',
    '',
    'Reglas:',
    '1. Usá SOLO productos de este catálogo. Nunca inventes productos, ids ni precios que no estén en la lista.',
    '2. Si preguntan por un producto que está en el catálogo y tiene stock mayor a 0: confirmá que hay, decí el precio, y si no dijo cantidad preguntá cuántos quiere. Si ya dijo o confirmó una cantidad, agregalo al carrito usando cart_actions con el id EXACTO del catálogo.',
    '3. Si preguntan por algo que no está en el catálogo, o está pero con stock 0: decí que no tenés eso, y recomendá 2 o 3 productos parecidos o de la misma categoría que SÍ tengan stock (por ejemplo, si piden arándanos y no hay, ofrecé frutillas u otras frutas congeladas). Poné esos productos en suggested_ids, pero NO los agregues a cart_actions todavía — el cliente los tiene que confirmar primero.',
    '4. Si el cliente confirma una sugerencia ("dale, esa", "sí, agregá 2"), ahí sí va en cart_actions.',
    '5. Podés agregar varios productos a la vez si el cliente lo pide en un solo mensaje.',
    '6. Si preguntan qué tienen en el carrito o el total, respondé con lo que ves en "CARRITO ACTUAL DEL CLIENTE" (no hace falta que uses cart_actions para eso).',
    '7. Respondé siempre en el JSON pedido, nada de texto afuera del JSON.'
  ].join('\n');
}

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'missing_api_key',
      reply: 'El asistente todavía no está configurado (falta la GEMINI_API_KEY en Vercel). Avisale al dueño del sitio.'
    });
    return;
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  var message = String(body.message || '').slice(0, 1000).trim();
  var history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  var cart = Array.isArray(body.cart) ? body.cart.slice(0, 50) : [];

  if (!message) {
    res.status(400).json({ error: 'empty_message' });
    return;
  }

  fetchCatalog().then(function (products) {
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    var cartText = cart.map(function (it) {
      var p = byId[it.id];
      return '- ' + (p ? p.name : it.id) + ' x' + it.qty;
    }).join('\n');

    var systemPrompt = buildSystemPrompt(catalogToText(products), cartText);

    var contents = history.map(function (h) {
      return { role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.text || '').slice(0, 1000) }] };
    });
    contents.push({ role: 'user', parts: [{ text: message }] });

    var geminiBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4
      }
    };

    return fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    ).then(function (geminiRes) {
      if (!geminiRes.ok) {
        return geminiRes.text().then(function (errText) {
          console.error('Gemini error', geminiRes.status, errText);
          var err = new Error('gemini_error');
          throw err;
        });
      }
      return geminiRes.json();
    }).then(function (geminiJson) {
      var text = geminiJson &&
        geminiJson.candidates &&
        geminiJson.candidates[0] &&
        geminiJson.candidates[0].content &&
        geminiJson.candidates[0].content.parts &&
        geminiJson.candidates[0].content.parts[0] &&
        geminiJson.candidates[0].content.parts[0].text;

      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        res.status(502).json({ error: 'bad_ai_response', reply: 'No entendí bien esa respuesta, ¿me lo repetís de otra forma?' });
        return;
      }

      // Nunca confiamos ciegamente en lo que devuelve el modelo: validamos
      // cada acción contra el catálogo real antes de dejar que el frontend
      // toque el carrito.
      var cartActions = (Array.isArray(parsed.cart_actions) ? parsed.cart_actions : [])
        .filter(function (a) { return a && byId[a.id] && Number.isFinite(a.qty) && a.qty > 0; })
        .map(function (a) {
          var p = byId[a.id];
          var maxQty = p.stock ? (p.stock_qty == null ? 999 : p.stock_qty) : 0;
          return { id: a.id, name: p.name, qty: Math.max(0, Math.min(Math.round(a.qty), maxQty)) };
        })
        .filter(function (a) { return a.qty > 0; });

      var suggestedIds = (Array.isArray(parsed.suggested_ids) ? parsed.suggested_ids : [])
        .filter(function (id) { return byId[id]; })
        .slice(0, 4);

      var suggested = suggestedIds.map(function (id) {
        var p = byId[id];
        return { id: p.id, name: p.name, price: p.price, unit: p.unit };
      });

      res.status(200).json({
        reply: String(parsed.reply || '').slice(0, 2000),
        cart_actions: cartActions,
        suggested: suggested
      });
    });
  }).catch(function (err) {
    console.error('chat endpoint error', err);
    res.status(502).json({ error: 'server_error', reply: 'Tuve un problema para responder. Probá de nuevo en un rato.' });
  });
};
