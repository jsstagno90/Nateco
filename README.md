# Nateco — Tienda online + /admin, con Supabase (sin servidor propio)

Misma tienda y panel CRM que la versión anterior, pero reescrita para que
**no necesite un servidor corriendo 24/7**: los datos viven en Supabase
(gratis) y el sitio son solo archivos HTML/CSS/JS que se pueden alojar
gratis en Netlify, Vercel o Cloudflare Pages. El único gasto fijo real es
el dominio.

## Qué cambia respecto a la versión con Node/Express

- Antes: un servidor propio guardaba todo en `data/db.json` y protegía
  `/admin` con usuario/contraseña simple. Necesitabas pagar un hosting
  con disco persistente (~US$5-7/mes).
- Ahora: los productos y pedidos viven en una base de datos Postgres de
  Supabase (plan gratis), y `/admin` se protege con un login real
  (Supabase Auth). El sitio en sí son archivos estáticos → hosting gratis.

El carrito → WhatsApp funciona exactamente igual que antes (link `wa.me`
con el pedido ya redactado, gratis, sin WhatsApp Business API).

## Paso 1 — Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta gratis.
2. Creá un proyecto nuevo (elegí una región cercana, ej. São Paulo).
3. Andá a **SQL Editor → New query**, pegá todo el contenido de
   `supabase/schema.sql` de esta carpeta, y **antes de correrlo**
   reemplazá `admin@nateco.com` (aparece en las políticas, buscalo con
   Ctrl+F) por el email real que vas a usar para entrar a `/admin`.
4. Ejecutá el script. Esto crea las tablas `products` y `orders`, las
   reglas de seguridad, y carga el catálogo inicial de Nateco.

## Paso 2 — Crear tu usuario de administrador

1. En Supabase: **Authentication → Users → Add user**.
2. Cargá el mismo email que pusiste en el schema.sql y una contraseña.
   Marcá "Auto Confirm User" para no tener que confirmar por mail.
3. Importante: andá a **Authentication → Settings** y desactivá "Allow
   new users to sign up" (o similar, el nombre exacto varía según la
   versión) — así nadie más puede crearse una cuenta. La app no tiene
   formulario de registro, solo de login, pero mejor cerrarlo también del
   lado de Supabase.

## Paso 3 — Completar la configuración

Abrí `js/supabase-config.js` y completá:

```js
window.SUPABASE_URL = 'https://tu-proyecto.supabase.co';   // Project Settings → API
window.SUPABASE_ANON_KEY = 'tu-anon-public-key';            // Project Settings → API
window.WHATSAPP_NUMBER = '5491168473363';                   // tu número, sin + ni espacios
window.STORE_NAME = 'Nateco';
```

La `anon public key` está pensada para ser pública (va en el navegador de
cualquier visitante) — la seguridad real la dan las políticas del
schema.sql, no el secreto de esa clave.

## Paso 4 — Probarlo local (opcional)

No hace falta Node ni instalar nada: es HTML plano. Cualquier servidor de
archivos estáticos sirve, por ejemplo:

```bash
npx serve .
```

y abrís `http://localhost:3000`.

## Paso 5 — Publicarlo gratis

Elegí uno (los tres tienen plan gratis que alcanza de sobra para esto):

- **Netlify**: arrastrá la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop), o conectá el repo de GitHub.
- **Vercel**: `vercel` desde la carpeta (con el [Vercel CLI](https://vercel.com/cli)), o importar el repo desde vercel.com.
- **Cloudflare Pages**: conectá el repo en el dashboard de Cloudflare, sin build command, carpeta de salida `/`.

No hay build ni dependencias — es subir la carpeta tal cual.

## Paso 6 — Conectar nateco.com

1. Comprá el dominio (Namecheap, Cloudflare Registrar, GoDaddy, o
   nic.ar si vas con `.com.ar`).
2. En el hosting que elegiste (Netlify/Vercel/Cloudflare Pages), agregá el
   dominio custom desde su panel — te va a pedir apuntar unos registros
   DNS (generalmente un CNAME o unos registros A) desde donde compraste
   el dominio. Cada plataforma te muestra los valores exactos a cargar.
3. El certificado HTTPS se genera solo, gratis, en los tres.

## Catálogo real de Nateco (con fotos)

`supabase/products_with_images.sql` trae el catálogo completo relevado de
pxw.com.ar/Nateco: 255 productos en los 18 rubros reales (Frutas
Congeladas, Verduras Congeladas, Frutos Secos, Suplementos, Cosmética,
Ofertas, etc.), cada uno con su foto real. El sitio y el panel `/admin`
ya están actualizados para mostrar estos 18 rubros y las fotos.

Para cargarlo en Supabase → SQL Editor, en este orden:

1. `supabase/add_image_column.sql` — agrega la columna `image` a la
   tabla `products` (solo hace falta correrlo una vez).
2. `supabase/products_with_images.sql` — borra el catálogo de ejemplo y
   carga los 255 productos reales, cada uno con la ruta a su foto.

Las 255 fotos (recomprimidas a JPG liviano, ~5.5MB en total) ya están en
la carpeta `images/products/` de este proyecto — se suben solas cuando
publiques el sitio (Netlify/Vercel/Cloudflare Pages), no hace falta nada
más. Si un producto no tiene foto (o la carpeta se moviera), el sitio
vuelve solo al ícono ilustrado como respaldo.

`supabase/products-real.sql` (el archivo viejo, sin fotos) queda
como referencia pero ya no hace falta usarlo — `products_with_images.sql`
lo reemplaza.

## Estructura

```
index.html, css/, js/            → tienda (habla directo con Supabase)
admin/index.html, css/, js/      → panel /admin (login + CRM)
images/products/                 → foto real de cada producto (255 fotos)
supabase/schema.sql              → tablas, seguridad y catálogo inicial (demo)
supabase/add_image_column.sql    → migración: agrega columna `image`
supabase/products_with_images.sql → catálogo REAL completo con fotos (255 productos)
supabase/products-real.sql       → catálogo real viejo, sin fotos (ya no hace falta)
```

## Notas

- **Total del pedido**: no lo calcula el navegador — un trigger en la
  base de datos lo recalcula a partir de los productos y cantidades antes
  de guardar el pedido, así nadie puede mandar un total inventado.
- **Seguridad**: cualquiera puede *crear* un pedido (así funciona el
  checkout sin pedirle login al cliente) pero solo el email que pusiste
  en el schema.sql puede *leer* pedidos, cambiar su estado, o editar el
  catálogo — esa regla vive en la base de datos (RLS), no en el código
  del sitio, así que no se puede saltear editando el HTML.
- **Pedidos en vivo**: el panel usa Supabase Realtime para actualizarse
  solo apenas entra un pedido nuevo, sin recargar la página. Si por lo
  que sea no llega, se refresca solo cada 60 segundos igual.
- **Clientes**: como antes, se arman agrupando los pedidos por teléfono —
  no hay una tabla aparte que se pueda desincronizar.
- **Plan gratis de Supabase**: tiene límites generosos para un negocio
  chico (base de datos, autenticación y Realtime incluidos), pero
  revisá los límites actuales en supabase.com/pricing antes de confiar
  en que nunca vas a necesitar el plan pago — los planes y precios
  pueden cambiar.
- La versión anterior (Node/Express, con hosting propio) sigue siendo
  válida si en algún momento preferís tener el control completo del
  servidor en vez de depender de Supabase.
