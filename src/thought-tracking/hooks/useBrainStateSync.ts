"use client";
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/supabase-client';
import { SupabaseStorageManager } from '@/thought-tracking/storage/supabaseStorage';

// Lightweight hook that fetches profiles.brain_state (if signed in)
// and caches it into localStorage via SupabaseStorageManager.loadBrainState().
export function useBrainStateSync() {
  useEffect(() => {
    const sync = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const storage = new SupabaseStorageManager(supabase, user.id);
        await storage.loadBrainState();
        console.log('Brain state synced');
      } catch (err) {
        console.warn('Brain state sync failed', err);
      }
    };

    sync();
  }, []);
} 