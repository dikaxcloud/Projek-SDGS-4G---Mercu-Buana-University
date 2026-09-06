function getAllowedOrigin(reqOrigin: string | null): string {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("SITE_URL") || ""
  if (!raw) return ""
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean)
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin
  // fallback to first allowed if no origin header (server-to-server) or exact match missing
  if (!reqOrigin && allowed.length) return allowed[0]
  return ""
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")
  const allowedOrigin = getAllowedOrigin(origin)
  return {
    "Access-Control-Allow-Origin": allowedOrigin || "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

// Legacy export for non-request contexts (empty origin)
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS")?.split(",")[0]?.trim() || Deno.env.get("SITE_URL") || "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
}
