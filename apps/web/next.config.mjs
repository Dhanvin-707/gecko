/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gecko/protocol'],
  experimental: {
    typedRoutes: false,
  },
}

export default nextConfig
