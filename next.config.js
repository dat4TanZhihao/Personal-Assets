/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  typescript: {
    tsconfigPath: './tsconfig.next.json'
  }
};

module.exports = nextConfig;
