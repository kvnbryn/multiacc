const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
