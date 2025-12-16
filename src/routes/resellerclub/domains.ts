import { FastifyInstance } from 'fastify';
import { createResellerClubClient } from '../../clients/domain-registrars/resellerclub/index.js';
import { env } from '../../config/env.js';

export async function resellerclubDomainRoutes(fastify: FastifyInstance) {
  // Search domain availability
  fastify.post<{
    Body: { domains: string[]; tlds?: string[] };
  }>(
    '/resellerclub/domains/search',
    {
      schema: {
        summary: 'Search Domain Availability',
        description: 'Check availability of domain names across multiple TLDs using ResellerClub API.',
        tags: ['resellerclub'],
        body: {
          type: 'object',
          required: ['domains'],
          properties: {
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of domain names to check (without TLD)',
              minItems: 1,
              maxItems: 10,
            },
            tlds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of TLDs to check (e.g., ["com", "net", "org"]). Defaults to common TLDs if not provided.',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                    available: { type: 'boolean' },
                    status: { type: 'string', enum: ['available', 'registered', 'unknown'] },
                    price: { type: 'number', nullable: true },
                    currency: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { domains, tlds = ['com', 'net', 'org', 'io', 'co'] } = request.body;

      // Validate ResellerClub credentials
      if (!env.RESELLERCLUB_AUTH_USERID || !env.RESELLERCLUB_API_KEY) {
        reply.code(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Domain search service is not configured',
          },
        });
        return;
      }

      try {
        const client = createResellerClubClient({
          authUserId: env.RESELLERCLUB_AUTH_USERID,
          apiKey: env.RESELLERCLUB_API_KEY,
          sandbox: env.RESELLERCLUB_SANDBOX,
        });

        // Check availability for each domain
        const results: Array<{
          domain: string;
          available: boolean;
          status: 'available' | 'registered' | 'unknown';
          price: number | null;
          currency: string | null;
        }> = [];

        // ResellerClub API allows checking multiple domains at once
        // We'll check each domain name against all TLDs
        for (const domainName of domains) {
          const response = await client.checkDomainAvailability(domainName, tlds);
          
          // Debug logging
          console.log('ResellerClub API Response:', JSON.stringify(response, null, 2));

          if (response.success && response.data) {
            // Process results for each TLD
            for (const tld of tlds) {
              const fullDomain = `${domainName}.${tld}`;
              const domainResult = response.data[fullDomain];

              if (domainResult) {
                const isAvailable = domainResult.status === 'available';
                results.push({
                  domain: fullDomain,
                  available: isAvailable,
                  status: isAvailable ? 'available' : domainResult.status === 'regthroughus' || domainResult.status === 'regthroughothers' ? 'registered' : 'unknown',
                  price: isAvailable ? 12.99 : null, // TODO: Fetch actual pricing from ResellerClub
                  currency: isAvailable ? 'USD' : null,
                });
              } else {
                results.push({
                  domain: fullDomain,
                  available: false,
                  status: 'unknown',
                  price: null,
                  currency: null,
                });
              }
            }
          } else {
            // If API call failed, mark all TLDs as unknown
            for (const tld of tlds) {
              results.push({
                domain: `${domainName}.${tld}`,
                available: false,
                status: 'unknown',
                price: null,
                currency: null,
              });
            }
          }
        }

        return { results };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_SEARCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Domain suggestions
  fastify.post<{
    Body: { keyword: string; tlds?: string[]; exactMatch?: boolean };
  }>(
    '/resellerclub/domains/suggest',
    {
      schema: {
        summary: 'Suggest Domain Names',
        description: 'Get domain name suggestions based on a keyword using ResellerClub API.',
        tags: ['resellerclub'],
        body: {
          type: 'object',
          required: ['keyword'],
          properties: {
            keyword: {
              type: 'string',
              description: 'Keyword to base suggestions on',
              minLength: 1,
            },
            tlds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of TLDs to limit suggestions to',
            },
            exactMatch: {
              type: 'boolean',
              description: 'Whether to only return exact matches',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { keyword, tlds, exactMatch } = request.body;

      if (!env.RESELLERCLUB_AUTH_USERID || !env.RESELLERCLUB_API_KEY) {
        reply.code(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Domain suggestion service is not configured',
          },
        });
        return;
      }

      try {
        const client = createResellerClubClient({
          authUserId: env.RESELLERCLUB_AUTH_USERID,
          apiKey: env.RESELLERCLUB_API_KEY,
          sandbox: env.RESELLERCLUB_SANDBOX,
        });

        const response = await client.suggestDomainNames(keyword, tlds, exactMatch);

        if (response.success && response.data) {
          return { suggestions: response.data };
        }

        return { suggestions: [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_SUGGESTION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Combined search: check exact domain + get suggestions
  fastify.post<{
    Body: { keyword: string; tlds?: string[]; maxSuggestions?: number };
  }>(
    '/resellerclub/domains/search-with-suggestions',
    {
      schema: {
        summary: 'Search Domain with Suggestions',
        description: 'Check availability of exact domain AND get alternative suggestions in one call.',
        tags: ['resellerclub'],
        body: {
          type: 'object',
          required: ['keyword'],
          properties: {
            keyword: {
              type: 'string',
              description: 'Domain name to search (without TLD)',
              minLength: 1,
            },
            tlds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of TLDs to check. Defaults to ["com", "net", "org", "io", "co"]',
            },
            maxSuggestions: {
              type: 'number',
              description: 'Max number of suggestions to return. Defaults to 10.',
              default: 10,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              exact: {
                type: 'array',
                description: 'Availability results for the exact domain across TLDs',
                items: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                    available: { type: 'boolean' },
                    status: { type: 'string', enum: ['available', 'registered', 'unknown'] },
                    price: { type: 'number', nullable: true },
                    currency: { type: 'string', nullable: true },
                  },
                },
              },
              suggestions: {
                type: 'array',
                description: 'Alternative available domain suggestions',
                items: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                    available: { type: 'boolean' },
                    status: { type: 'string' },
                    price: { type: 'number', nullable: true },
                    currency: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { keyword, tlds = ['com', 'net', 'org', 'io', 'co'], maxSuggestions = 10 } = request.body;

      if (!env.RESELLERCLUB_AUTH_USERID || !env.RESELLERCLUB_API_KEY) {
        reply.code(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Domain search service is not configured',
          },
        });
        return;
      }

      try {
        const client = createResellerClubClient({
          authUserId: env.RESELLERCLUB_AUTH_USERID,
          apiKey: env.RESELLERCLUB_API_KEY,
          sandbox: env.RESELLERCLUB_SANDBOX,
        });

        // Run both queries in parallel
        const [availabilityResponse, suggestionsResponse] = await Promise.all([
          client.checkDomainAvailability(keyword, tlds),
          client.suggestDomainNames(keyword, tlds),
        ]);

        // Process exact domain results
        const exact: Array<{
          domain: string;
          available: boolean;
          status: 'available' | 'registered' | 'unknown';
          price: number | null;
          currency: string | null;
        }> = [];

        if (availabilityResponse.success && availabilityResponse.data) {
          for (const tld of tlds) {
            const fullDomain = `${keyword}.${tld}`;
            const domainResult = availabilityResponse.data[fullDomain];

            if (domainResult) {
              const isAvailable = domainResult.status === 'available';
              exact.push({
                domain: fullDomain,
                available: isAvailable,
                status: isAvailable ? 'available' : domainResult.status === 'regthroughus' || domainResult.status === 'regthroughothers' ? 'registered' : 'unknown',
                price: isAvailable ? 12.99 : null, // TODO: Fetch actual pricing
                currency: isAvailable ? 'USD' : null,
              });
            } else {
              exact.push({
                domain: fullDomain,
                available: false,
                status: 'unknown',
                price: null,
                currency: null,
              });
            }
          }
        }

        // Process suggestions - filter out exact matches and limit count
        const suggestions: Array<{
          domain: string;
          available: boolean;
          status: string;
          price: number | null;
          currency: string | null;
        }> = [];

        if (suggestionsResponse.success && suggestionsResponse.data) {
          const exactDomains = new Set(exact.map(e => e.domain.toLowerCase()));
          
          for (const suggestion of suggestionsResponse.data) {
            // Skip if it's the same as one of the exact searches
            if (exactDomains.has(suggestion.toLowerCase())) continue;
            
            // Suggestions from the API are already available
            suggestions.push({
              domain: suggestion,
              available: true,
              status: 'available',
              price: 12.99, // TODO: Fetch actual pricing
              currency: 'USD',
            });

            if (suggestions.length >= maxSuggestions) break;
          }
        }

        return { exact, suggestions };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_SEARCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

