'use client';
import { ReactNode } from 'react';
import { useBrainStateSync } from '@/thought-tracking/hooks/useBrainStateSync';

interface Props {
  children: ReactNode;
}

export default function BrainStateLoader({ children }: Props) {
  useBrainStateSync();
  return <>{children}</>;
} 