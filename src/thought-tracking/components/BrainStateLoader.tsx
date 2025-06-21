'use client';
import { ReactNode } from 'react';
import { useBrainStateSync } from '@/thought-tracking/hooks/useBrainStateSync';
import SupabaseAuthListener from '@/lib/supabase/SupabaseAuthListener';

interface Props {
  children: ReactNode;
}

export default function BrainStateLoader({ children }: Props) {
  useBrainStateSync();
  return (
    <>
      <SupabaseAuthListener />
      {children}
    </>
  );
} 