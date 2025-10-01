import { NextResponse } from "next/server";

export async function GET() {
  const testData = {
    message: "測試中文字符處理",
    projectName: "能量水晶GSTW",
    urls: [
      "https://girlstyle.com/my/article/240406/美容護膚",
      "https://example.com/中文路徑/測試頁面"
    ],
    keywords: [
      "美容護膚",
      "能量水晶",
      "時尚穿搭",
      "健康生活"
    ],
    unicode: {
      char: "晶",
      code: "晶".charCodeAt(0),
      isProblematic: "晶".charCodeAt(0) > 255
    }
  };

  try {
    // 使用 NextResponse.json() 來正確處理 UTF-8 編碼
    console.log("Testing NextResponse.json for Chinese characters");
    return NextResponse.json(testData, {
      status: 200,
    });
  } catch (error) {
    console.error("Response with TextEncoder failed:", error);
    
    // 最後的回退方案
    return NextResponse.json({ 
      error: "Failed to encode Chinese characters",
      details: error.message 
    }, { status: 500 });
  }
}

export const runtime = "nodejs";