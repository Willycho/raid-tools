"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("rsl_visitor_id");
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("rsl_visitor_id", id);
  }
  return id;
}

// 같은 페이지 30분 내 중복 로깅 방지
function shouldLog(page: string): boolean {
  if (typeof window === "undefined") return false;
  const key = `rsl_visit_${page}`;
  const last = localStorage.getItem(key);
  const now = Date.now();
  if (last && now - parseInt(last) < 30 * 60 * 1000) return false;
  localStorage.setItem(key, now.toString());
  return true;
}

export default function VisitLogger() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    // /admin 페이지는 로깅 안 함
    if (pathname.startsWith("/admin")) return;

    const visitorId = getVisitorId();
    if (!visitorId) return;
    if (!shouldLog(pathname)) return;

    getSupabase()
      .from("page_visits")
      .insert({
        visitor_id: visitorId,
        user_id: user?.id || null,
        page: pathname,
      })
      .then(() => {});
  }, [pathname, user]);

  return null;
}
