'use client';
// Removed useBrainStateSync - thought-tracking system not used
import SupabaseAuthListener from '@/lib/supabase/SupabaseAuthListener';
import DashboardSidebarProvider from '@/components/left-sidebar/DashboardSidebarProvider';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Only run dashboard logic if we're actually on a dashboard route
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  
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