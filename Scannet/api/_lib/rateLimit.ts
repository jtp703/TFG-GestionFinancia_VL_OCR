/** Rate limiter en memoria — funciona en local y en instancias serverless individuales.
 *  Para producción multi-instancia considera Upstash Redis. */
const buckets = new Map<string, { count: number; reset: number }>()

/**
 * Devuelve true si la petición está dentro del límite.
 * @param key    Clave única (ej: userId)
 * @param limit  Máximo de peticiones por ventana de 60 segundos
 */
export function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + 60_000 })
    return true
  }

  if (bucket.count >= limit) return false
  bucket.count++
  return true
}
