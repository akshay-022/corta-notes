'use client';
// Removed useBrainStateSync - thought-tracking system not used
import SupabaseAuthListener from '@/lib/supabase/SupabaseAuthListener';
import DashboardSidebarProvider from '@/components/left-sidebar/DashboardSidebarProvider';
import ParaHelpDialog from '@/components/help/ParaHelpDialog';
import { usePathname, useRouter } from 'next/navigation';
import { initializeParaStructure } from '@/lib/auto-organization/initialization';
import { useEffect, useState } from 'react';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showParaHelp, setShowParaHelp] = useState(false);
  
  // Only run dashboard logic if we're actually on a dashboard route
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  
  // One-time PARA initialisation for brand-new accounts
  useEffect(() => {
    if (!isDashboardRoute) return;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          logger.error('PARA check: no authenticated user');
          return;
        }

        const { data: existingPages, error } = await supabase
          .from('pages')
          .select('uuid')
          .eq('user_id', user.id)
          .limit(1);

        if (error) {
          logger.error('PARA check: failed to fetch existing pages', error);
          return;
        }

        if (existingPages && existingPages.length === 0) {
          logger.info('PARA check: no pages found – running initialisation');
          
          // Set flag in localStorage before creating PARA structure (for reload logic)
          localStorage.setItem('corta-first-time-user', 'true');
          logger.info('Set localStorage flag for first-time user');
          
          const { created } = await initializeParaStructure(supabase);
          logger.info('PARA structure created for new account', { createdCount: created.length });
          
          // Refresh the router and show help dialog for newly created PARA structure
          if (created.length > 0) {
            logger.info('PARA structure creation completed, refreshing router', { 
              createdCount: created.length 
            });
            
            router.refresh();
            logger.info('Opening PARA help dialog');
            console.log('DashboardLayout: Setting showParaHelp to true');
            setShowParaHelp(true);
          }
        } else {
          logger.info('PARA check: pages already exist – initialisation skipped');
        }
      } catch (err) {
        logger.error('Failed during PARA initialisation check', err);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDashboardRoute]);
  
  return (
    <>
      {isDashboardRoute && <SupabaseAuthListener />}
      {isDashboardRoute ? (
        <DashboardSidebarProvider>{children}</DashboardSidebarProvider>
      ) : (
        children
      )}
      
      {/* PARA Help Dialog - shows on all dashboard routes */}
      {isDashboardRoute && (
        <ParaHelpDialog 
          autoOpen={showParaHelp}
          onAutoOpenComplete={() => {
            console.log('DashboardLayout: onAutoOpenComplete called, setting showParaHelp to false');
            setShowParaHelp(false);
          }}
        />
      )}
    </>
  );
} 