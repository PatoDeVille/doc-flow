import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { appConfig } from '../config';

export const createServer = () => {
  const fastify = Fastify({
    logger: appConfig.nodeEnv === 'development' 
  });

  // Enable file uploads 
  fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    }
  });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return fastify;
};