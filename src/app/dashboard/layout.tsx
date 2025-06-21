'use client';
import { useBrainStateSync } from '@/thought-tracking/hooks/useBrainStateSync';
import SupabaseAuthListener from '@/lib/supabase/SupabaseAuthListener';
import DashboardSidebarProvider from '@/components/left-sidebar/DashboardSidebarProvider';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Only run dashboard logic if we're actually on a dashboard route
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  
  // Load brain state only for dashboard pages
  if (isDashboardRoute) {
    useBrainStateSync();
  }
  
  return (
    <>
      {isDashboardRoute && <SupabaseAuthListener />}
      {isDashboardRoute ? (
        <DashboardSidebarProvider>{children}</DashboardSidebarProvider>
      ) : (
        children
      )}
    </>
  );
} 