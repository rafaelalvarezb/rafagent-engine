// Server configuration for hybrid architecture
export const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3001';

export const SERVER_CONFIG = {
  ENGINE_URL,
  IS_HYBRID_MODE: !!process.env.ENGINE_URL,
  
  // Endpoints that should be redirected to engine
  ENGINE_ENDPOINTS: [
    '/api/agent/run',
    '/api/engine/status',
    '/api/engine/health'
  ],
  
  // Check if endpoint should be redirected to engine
  shouldRedirectToEngine: (path: string): boolean => {
    return SERVER_CONFIG.ENGINE_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
  }
};
