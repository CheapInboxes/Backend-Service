import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../clients/infrastructure/supabase.js';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadRoutes(fastify: FastifyInstance) {
  /**
   * Upload a profile picture
   * Accepts base64 encoded image data
   */
  fastify.post<{
    Params: { orgId: string };
    Body: {
      file_data: string; // base64 encoded
      file_name: string;
      content_type: string;
    };
  }>(
    '/orgs/:orgId/uploads/profile-picture',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Upload a profile picture for mailbox personas. Accepts base64 encoded image data.',
        tags: ['uploads'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['file_data', 'file_name', 'content_type'],
          properties: {
            file_data: { type: 'string', description: 'Base64 encoded image data' },
            file_name: { type: 'string', description: 'Original file name' },
            content_type: { type: 'string', description: 'MIME type (image/jpeg, image/png, etc.)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Public URL of the uploaded image' },
              path: { type: 'string', description: 'Storage path of the file' },
            },
          },
          400: { $ref: 'ApiError' },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;
      const { file_data, file_name, content_type } = request.body;

      // Validate content type
      if (!ALLOWED_MIME_TYPES.includes(content_type)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          },
        });
      }

      // Decode base64
      let buffer: Buffer;
      try {
        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        const base64Data = file_data.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } catch {
        return reply.code(400).send({
          error: { code: 'INVALID_BASE64', message: 'Invalid base64 encoded data' },
        });
      }

      // Check file size
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.code(400).send({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
        });
      }

      // Generate unique file path
      const ext = file_name.split('.').pop() || 'jpg';
      const uniqueFileName = `${randomUUID()}.${ext}`;
      const storagePath = `profile-pictures/${orgId}/${uniqueFileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(storagePath, buffer, {
          contentType: content_type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return reply.code(400).send({
          error: { code: 'UPLOAD_FAILED', message: uploadError.message },
        });
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(storagePath);

      return {
        url: urlData.publicUrl,
        path: storagePath,
      };
    }
  );

  /**
   * Delete a profile picture
   */
  fastify.delete<{
    Params: { orgId: string };
    Body: { path: string };
  }>(
    '/orgs/:orgId/uploads/profile-picture',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Delete a previously uploaded profile picture.',
        tags: ['uploads'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', description: 'Storage path of the file to delete' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: { $ref: 'ApiError' },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;
      const { path } = request.body;

      // Verify the path belongs to this org (security check)
      if (!path.startsWith(`profile-pictures/${orgId}/`)) {
        return reply.code(400).send({
          error: { code: 'INVALID_PATH', message: 'Invalid file path for this organization' },
        });
      }

      const { error } = await supabase.storage
        .from('uploads')
        .remove([path]);

      if (error) {
        console.error('Delete error:', error);
        return reply.code(400).send({
          error: { code: 'DELETE_FAILED', message: error.message },
        });
      }

      return { success: true };
    }
  );
}

