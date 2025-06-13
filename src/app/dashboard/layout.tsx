import DashboardSidebarProvider from '@/components/left-sidebar/DashboardSidebarProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardSidebarProvider>{children}</DashboardSidebarProvider>;
} 