import { NextResponse } from "next/server";

function safeEncodeUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    // 先解碼再編碼，確保一致性
    const decoded = decodeURIComponent(url);
    return encodeURI(decoded);
  } catch {
    // 如果解碼失敗，嘗試直接編碼
    try {
      return encodeURI(url);
    } catch {
      // 如果都失敗，返回原始 URL
      return url;
    }
  }
}

function extractArticleId(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/article\/(\d+)/);
  return m ? m[1] : null;
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const testUrl = url.searchParams.get("url");
    
    if (!testUrl) {
      return NextResponse.json({
        error: "Please provide a URL parameter",
        example: "/api/debug/url-encoding?url=https://example.com/article/123/中文"
      });
    }

    const results = {
      original: testUrl,
      safeEncoded: safeEncodeUrl(testUrl),
      articleId: extractArticleId(testUrl),
      articleIdFromEncoded: extractArticleId(safeEncodeUrl(testUrl)),
      charCodes: Array.from(testUrl).map((char, index) => ({
        index,
        char,
        charCode: char.charCodeAt(0),
        isProblematic: char.charCodeAt(0) > 255
      })),
      problematicChars: Array.from(testUrl)
        .map((char, index) => ({ index, char, charCode: char.charCodeAt(0) }))
        .filter(item => item.charCode > 255)
    };

    return NextResponse.json(results);

  } catch (error) {
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}

export const runtime = "nodejs";