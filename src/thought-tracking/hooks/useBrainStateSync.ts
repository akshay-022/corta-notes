"use client";
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/supabase-client';
import { SupabaseStorageManager } from '@/thought-tracking/storage/supabaseStorage';

// Lightweight hook that fetches profiles.brain_state (if signed in)
// and caches it into localStorage via SupabaseStorageManager.loadBrainState().
export function useBrainStateSync() {
  useEffect(() => {
    // Don't run on login pages
    if (typeof window !== 'undefined' && window.location.pathname.includes('/login')) {
      return;
    }

    const sync = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        
        const storage = new SupabaseStorageManager(supabase, user.id);
        await storage.loadBrainState();
        console.log('Brain state synced');
      } catch (err) {
        // Ignore HMR-related errors in development
        if (err instanceof Error && err.message.includes('no longer runnable')) {
          console.warn('Brain state sync interrupted by HMR, ignoring...');
          return;
        }
        console.warn('Brain state sync failed', err);
      }
    };

    sync();
  }, []);
} 