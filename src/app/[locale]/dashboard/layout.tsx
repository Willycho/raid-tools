import AdSidebar from "@/components/AdSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdSidebar>{children}</AdSidebar>;
}
