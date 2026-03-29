"use client";

import AuthGuard from "@/components/AuthGuard";

export default function ClanBossLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
