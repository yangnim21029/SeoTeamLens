export async function GET(req) {
  const url = new URL(req.url);
  const testString = url.searchParams.get("text") || "UL 功效, 湯水 (主要、次要)";
  
  const results = {
    original: testString,
    length: testString.length,
    charCodes: Array.from(testString).map((char, index) => ({
      index,
      char,
      charCode: char.charCodeAt(0),
      isProblematic: char.charCodeAt(0) > 255,
      unicode: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
    })),
    problematicChars: Array.from(testString)
      .map((char, index) => ({ index, char, charCode: char.charCodeAt(0) }))
      .filter(item => item.charCode > 255),
    encodingTests: {}
  };

  // 測試不同的編碼方法
  try {
    results.encodingTests.textEncoder = {
      success: true,
      result: new TextEncoder().encode(testString).length + " bytes"
    };
  } catch (error) {
    results.encodingTests.textEncoder = {
      success: false,
      error: error.message
    };
  }

  try {
    results.encodingTests.jsonStringify = {
      success: true,
      result: JSON.stringify(testString).length + " chars"
    };
  } catch (error) {
    results.encodingTests.jsonStringify = {
      success: false,
      error: error.message
    };
  }

  try {
    results.encodingTests.encodeURIComponent = {
      success: true,
      result: encodeURIComponent(testString)
    };
  } catch (error) {
    results.encodingTests.encodeURIComponent = {
      success: false,
      error: error.message
    };
  }

  // 使用 NextResponse.json() 來正確處理 UTF-8 編碼
  return NextResponse.json(results, {
    status: 200,
  });
}

export const runtime = "nodejs";