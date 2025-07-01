'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, CheckCircle } from 'lucide-react'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')

  useEffect(() => {
    // Get email from URL params if provided
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
            <Mail size={32} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Check your email</h1>
          <p className="text-gray-400 text-sm">We've sent you a verification link</p>
        </div>

        {/* Main message */}
        <div className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle size={20} className="text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-white font-medium mb-2">Account created successfully!</h2>
              <p className="text-gray-300 text-sm leading-relaxed">
                We've sent a verification link to{' '}
                {email && (
                  <span className="text-blue-400 font-medium">{email}</span>
                )}
                {!email && 'your email address'}.
              </p>
            </div>
          </div>
          
          <div className="text-sm text-gray-400 space-y-2">
            <p>Please check your email and click the verification link to activate your account.</p>
            <p>Once verified, you can sign in and start using your second brain!</p>
          </div>
        </div>

        {/* Additional info */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
          <h3 className="text-blue-300 font-medium text-sm mb-2">What's next?</h3>
          <ul className="text-xs text-blue-200/80 space-y-1">
            <li>• Check your email inbox (and spam folder)</li>
            <li>• Click the verification link</li>
            <li>• Return here to sign in</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link 
            href="/login"
            className="w-full bg-white hover:bg-gray-100 text-black font-medium py-2 px-3 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] text-center block"
          >
            Go to Sign In
          </Link>
          
          <div className="text-center">
            <p className="text-gray-400 text-xs">
              Didn't receive the email?{' '}
              <button 
                onClick={() => window.location.reload()}
                className="text-blue-400 hover:text-blue-300 transition-colors underline"
              >
                Refresh page
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
} 