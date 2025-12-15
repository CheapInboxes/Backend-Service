import { FastifyInstance } from 'fastify';
import { resellerclubDomainRoutes } from './domains.js';
import { resellerclubPricingRoutes } from './pricing.js';

export async function resellerclubRoutes(fastify: FastifyInstance) {
  await fastify.register(resellerclubDomainRoutes);
  await fastify.register(resellerclubPricingRoutes);
}

