/** @type {import('next').NextConfig} */
const config = {
  // Required for @libsql/client native bindings on Vercel
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'libsql'],
  },
  // Vercel edge-compatible headers for streaming
  async headers() {
    return [
      {
        source: '/api/claude',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ]
  },
}

export default config
