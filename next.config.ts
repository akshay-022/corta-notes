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
      maxInactiveAge: 60 * 1000, // Keep pages longer
      pagesBufferLength: 5, // Keep more pages in memory
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
        poll: 2000, // Check for changes every 2 seconds instead of continuously
        aggregateTimeout: 1000, // Wait 1 second before rebuilding after changes
        ignored: ['**/node_modules', '**/.git', '**/.next'], // Ignore common directories
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
