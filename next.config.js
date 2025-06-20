const nextConfig = {
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
