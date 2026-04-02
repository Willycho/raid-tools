"use client";

// TODO: AdSense 승인 후 hidden 제거하고 실제 광고 코드 삽입
export default function AdSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="xl:flex xl:justify-center xl:gap-4 xl:px-4">
      {/* Left sidebar ad — hidden until AdSense approved */}
      <aside className="hidden flex-col items-center w-[160px] flex-shrink-0 pt-6">
        <div
          className="sticky top-20 w-[160px] min-h-[600px] rounded-lg border border-dashed border-card-border/40 bg-card/20 flex items-start justify-center pt-4"
          id="ad-slot-left"
        >
          {/* AdSense 160x600 */}
        </div>
      </aside>

      <div className="flex-1 min-w-0 xl:max-w-6xl">{children}</div>

      {/* Right sidebar ad — hidden until AdSense approved */}
      <aside className="hidden flex-col items-center w-[160px] flex-shrink-0 pt-6">
        <div
          className="sticky top-20 w-[160px] min-h-[600px] rounded-lg border border-dashed border-card-border/40 bg-card/20 flex items-start justify-center pt-4"
          id="ad-slot-right"
        >
          {/* AdSense 160x600 */}
        </div>
      </aside>
    </div>
  );
}
