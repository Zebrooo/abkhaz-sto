// Живость контейнера для healthcheck compose и Traefik: без базы и сессии.
export function GET() {
  return Response.json({ ok: true });
}
