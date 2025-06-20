// File: next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // TAMBAHKAN BARIS INI
  output: 'standalone',

  experimental: {
    serverActions: {
      bodySizeLimit: '1000mb',
    },
  },

  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
