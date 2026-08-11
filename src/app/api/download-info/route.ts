import { NextRequest, NextResponse } from "next/server"
import { getDownloadInfo } from "@/lib/video-extract"

// GET /api/download-info?embed=<embed-url>&referer=<referer>&variant=N
//
// Extracts the direct video URL from an embed page (MixDrop, Morencius, VOE,
// etc.) and immediately HEADs it to get the file size — all in ONE request.
// Uses shared logic from @/lib/video-extract so it works in both dev and
// production (no localhost:3000 fetch needed).

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const embedUrl = url.searchParams.get("embed")
  const referer = url.searchParams.get("referer") || ""
  const variantParam = url.searchParams.get("variant")
  const variantIndex = variantParam !== null ? parseInt(variantParam, 10) : -1

  if (!embedUrl) {
    return NextResponse.json({ error: "embed required" }, { status: 400 })
  }

  try {
    const info = await getDownloadInfo(embedUrl, referer, variantIndex)
    return NextResponse.json({
      success: info.success,
      videoUrl: info.videoUrl,
      videoType: info.videoType,
      size: info.size,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ success: false, size: 0, error })
  }
}
