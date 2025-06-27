import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge';

// This API route is deprecated - organization now happens in the frontend
// using the organizePage function from src/lib/auto-organization/organized-file-updates/organizer.ts
export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    error: 'This API route is deprecated. Organization now happens in the frontend using the organizePage function.' 
  }, { status: 410 })
} 