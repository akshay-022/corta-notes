import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Temporarily disable strict mode to debug multiple requests in development
  reactStrictMode: false,
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Development optimizations
  ...(process.env.NODE_ENV === 'development' && {
    // Reduce hot reload sensitivity
    onDemandEntries: {
      // Keep compiled pages in memory longer so navigating back doesn't trigger a fresh
      // recompilation (improves cold-navigation latency in dev)
      maxInactiveAge: 60 * 1000, // 1 minute (reduced from 90s)
      pagesBufferLength: 10, // store fewer pages simultaneously (reduced from 20)
    },
    // Reduce file watching frequency
    experimental: {
      optimizeCss: false, // Disable CSS optimization in dev
    },
  }),
  
  webpack: (config, { isServer, dev }) => {
    // Suppress webpack warnings
    config.ignoreWarnings = [
      /Critical dependency: the request of a dependency is an expression/,
      /Cannot resolve dependency/,
      /Module not found/
    ];
    
    // Suppress specific Supabase realtime warnings
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Development optimizations
    if (dev) {
      // Reduce file watching sensitivity
      config.watchOptions = {
        ...config.watchOptions,
        poll: 3000, // Check for changes every 3 seconds (increased from 2s)
        aggregateTimeout: 1500, // Wait 1.5 seconds before rebuilding (increased from 1s)
        ignored: ['**/node_modules', '**/.git', '**/.next', '**/supabase'], // Ignore more directories
      };
      
      // Reduce cache size
      config.cache = {
        type: 'filesystem',
        maxMemoryGenerations: 1, // Reduce memory cache
        maxAge: 5 * 60 * 1000, // 5 minutes max age
      };
    }

    return config;
  },
  
  // Disable logging during development
  logging: {
    fetches: {
      fullUrl: false
    }
  }
};

export default nextConfig;
