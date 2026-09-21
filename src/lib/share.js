// Encode/decode a single routine into a compact, URL-shareable string.
// Uses CompressionStream when available; falls back to a plain base64 JSON
// blob when it isn't, or when the compressed result would still make an
// unreasonably long URL. Callers should treat a null result as "too big for
// a URL" and fall back to a copyable text blob instead.
const MAX_HASH_LENGTH = 8000

function toBase64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function compress(text) {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function decompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  return new TextDecoder().decode(buf)
}

/** Encode a routine into { encoded, compressed } for a URL hash, or null if
 *  it's too long to share as a URL at all. */
export async function encodeRoutine(routine) {
  const json = JSON.stringify(routine)

  const compressedBytes = await compress(json)
  if (compressedBytes) {
    const encoded = toBase64Url(compressedBytes)
    if (encoded.length <= MAX_HASH_LENGTH) return { encoded, compressed: true }
  }

  const rawEncoded = toBase64Url(new TextEncoder().encode(json))
  if (rawEncoded.length <= MAX_HASH_LENGTH) return { encoded: rawEncoded, compressed: false }

  return null
}

/** Decode a routine previously produced by encodeRoutine. Throws on
 *  malformed input -- callers must treat the result as untrusted data. */
export async function decodeRoutine(encoded, compressed) {
  const bytes = fromBase64Url(encoded)
  const json = compressed ? await decompress(bytes) : new TextDecoder().decode(bytes)
  return JSON.parse(json)
}
