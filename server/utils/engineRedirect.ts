// Configuration for redirecting automation calls to persistent engine
import { ENGINE_URL } from '../config';

export async function redirectToEngine(endpoint: string, options: RequestInit = {}) {
  const engineUrl = `${ENGINE_URL}${endpoint}`;
  
  try {
    const response = await fetch(engineUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`Engine request failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    console.error('Failed to redirect to engine:', error);
    throw error;
  }
}
