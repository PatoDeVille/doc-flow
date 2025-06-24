// Super simple mock auth for demo purposes

export interface AuthContext {
  accountId: string;
  clientId: string;
}

export class AuthService {
  // Mock: Any "Bearer something" returns demo account
  static validateToken(authHeader: string | undefined): AuthContext | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7).trim();
    
    // Demo: As long as there's something after "Bearer ", return mock account
    if (token.length > 0) {
      return {
        accountId: 'acc_acme_123',
        clientId: 'acme-corp'
      };
    }

    return null;
  }
}

// Simple middleware
export const requireAuth = async (request: any, reply: any) => {
  const authContext = AuthService.validateToken(request.headers.authorization);

  if (!authContext) {
    return reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Bearer token required (demo: use any Bearer token)' 
    });
  }

  // Attach to request
  request.auth = authContext;
};