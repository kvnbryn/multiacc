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

export default nextConfig;
