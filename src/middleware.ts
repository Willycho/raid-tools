import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // 쿠키에 사용자가 직접 선택한 locale이 있으면 우선 사용
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookieLocale && routing.locales.includes(cookieLocale as "ko" | "en")) {
    // next-intl이 쿠키를 읽어서 처리하도록 위임
    return intlMiddleware(request);
  }

  // Vercel IP 기반 국가 감지: KR이면 한국어, 나머지는 영어
  const country = request.headers.get("x-vercel-ip-country");
  if (country === "KR") {
    // Accept-Language 헤더를 ko로 설정하여 next-intl이 ko로 감지하게 함
    const headers = new Headers(request.headers);
    headers.set("accept-language", "ko");
    const newRequest = new NextRequest(request.url, {
      headers,
      method: request.method,
    });
    // 원본 request의 쿠키 복사
    for (const [name, value] of request.cookies.getAll().map(c => [c.name, c.value])) {
      newRequest.cookies.set(name, value);
    }
    return intlMiddleware(newRequest);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // 모든 경로에 매칭하되, api, _next, 정적 파일 등은 제외
    "/((?!api|_next|_vercel|data|auth|.*\\..*).*)",
  ],
};
