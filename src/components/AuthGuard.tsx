"use client";

import { useAuth } from "@/lib/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
          <svg className="w-12 h-12 mx-auto text-gold mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-white text-lg font-bold mb-2">로그인이 필요합니다</h2>
          <p className="text-gray-500 text-sm mb-6">
            이 기능을 사용하려면 Google 계정으로 로그인해주세요.
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-gold text-background px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors cursor-pointer"
          >
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
