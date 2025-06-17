import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
        poll: 1000, // Check for changes every second instead of continuously
        aggregateTimeout: 300, // Delay before rebuilding
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
