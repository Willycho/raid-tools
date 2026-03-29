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

export default function VisitLogger() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const visitorId = getVisitorId();
    if (!visitorId) return;

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
