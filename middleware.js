// Verrou d'accès Edge Middleware (Vercel) — s'exécute côté serveur avant
// que la moindre page ne soit envoyée au navigateur : contrairement à une
// vérification en JS classique, elle n'est jamais visible ni contournable
// depuis les devtools.
//
// Deux niveaux :
// - code général (ATYCASA_INVITE_CODE) -> accès à l'app, jamais à /admin.html
// - code admin (ATYCASA_ADMIN_CODE)    -> accès à tout, y compris /admin.html
//
// Tant que ATYCASA_COOKIE_SECRET et ATYCASA_INVITE_CODE ne sont pas
// configurés dans les variables d'environnement Vercel, ce middleware ne
// bloque rien (fail-open) pour ne jamais casser le déploiement par erreur
// de config — voir topos_sessions/notes.md pour la checklist de mise en
// service.

export const config = {
  matcher: '/:path*',
}

const COOKIE_NAME = 'atycasa_access'
const MAX_AGE = 60 * 60 * 24 * 365 // 1 an

function getCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function makeCookie(scope, secret) {
  const expiry = Date.now() + MAX_AGE * 1000
  const payload = `${scope}.${expiry}`
  const sig = await hmac(secret, payload)
  return `${payload}.${sig}`
}

async function verifyCookie(value, secret) {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [scope, expiry, sig] = parts
  if (!expiry || Date.now() > Number(expiry)) return null
  const expected = await hmac(secret, `${scope}.${expiry}`)
  if (expected !== sig) return null
  return scope
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const secret = process.env.ATYCASA_COOKIE_SECRET
  const inviteCode = process.env.ATYCASA_INVITE_CODE
  const adminCode = process.env.ATYCASA_ADMIN_CODE

  if (!secret || !inviteCode) return // pas configuré : n'entrave rien

  if (url.pathname === '/invite.html') return // toujours accessible

  const cookieVal = getCookie(request, COOKIE_NAME)
  let scope = await verifyCookie(cookieVal, secret)

  const code = url.searchParams.get('invite')
  let attemptedBadCode = false
  if (!scope && code) {
    if (adminCode && code === adminCode) scope = 'admin'
    else if (code === inviteCode) scope = 'general'
    else attemptedBadCode = true
  }

  const isAdminPath = url.pathname === '/admin.html'
  const authorized = scope && !(isAdminPath && scope !== 'admin')

  if (!authorized) {
    const dest = new URL('/invite.html', url)
    if (attemptedBadCode) dest.searchParams.set('invalid', '1')
    return Response.redirect(dest, 302)
  }

  if (code) {
    const clean = new URL(url)
    clean.searchParams.delete('invite')
    const token = await makeCookie(scope, secret)
    return new Response(null, {
      status: 302,
      headers: {
        Location: clean.toString(),
        'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      },
    })
  }
  // scope valide via cookie existant : rien à faire, laisse passer
}
