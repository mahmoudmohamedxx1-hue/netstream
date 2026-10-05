// GET /api/extract-video?url={embedUrl}&referer={referer}
//
// Extracts a direct video URL (MP4 / M3U8) from a video-host embed page
// (MixDrop, VOE, FastVIP, HGLink, …) using the shared extraction logic in
// @/lib/video-extract. Used by the player's Arabic provider flow as a
// health/validity check before rendering an embed through /api/video-proxy.

import { NextResponse } from "next/server"
import { extractDirectFromEmbed } from "@/lib/video-extract"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("url")
  const referer = url.searchParams.get("referer") || undefined
  const host = url.searchParams.get("host") || ""

  if (!embedUrl || !/^https?:\/\//.test(embedUrl)) {
    return NextResponse.json({ success: false, error: "Invalid url" })
  }

  try {
    const extracted = await extractDirectFromEmbed(embedUrl, host, referer)
    if (!extracted || !extracted.url) {
      return NextResponse.json({ success: false, error: "No video found" })
    }
    return NextResponse.json({
      success: true,
      videoUrl: extracted.url,
      videoType: extracted.type,
      referer: extracted.referer,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "Extraction failed",
    })
  }
}
