import { createAuthService } from '../services/auth.service.js';

export async function adminRoutes(fastify) {
  const authService = createAuthService(fastify);

  fastify.get('/stats', {
    onRequest: [fastify.authenticateAdmin],
  }, async (request, reply) => {
    try {
      const stats = await authService.getUserStats();

      return reply.send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch stats' });
    }
  });

  fastify.get('/users', {
    onRequest: [fastify.authenticateAdmin],
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 50;

      const result = await authService.getAllUsers(page, limit);

      return reply.send(result);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch users' });
    }
  });

  fastify.delete('/users/:userId', {
    onRequest: [fastify.authenticateAdmin],
  }, async (request, reply) => {
    try {
      const { prisma } = await import('../db/prisma.js');

      const user = await prisma.user.findUnique({
        where: { id: BigInt(request.params.userId) },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      if (user.id.toString() === request.user.id.toString()) {
        return reply.code(400).send({ error: 'Cannot delete yourself' });
      }

      await prisma.user.delete({
        where: { id: BigInt(request.params.userId) },
      });

      return reply.send({ message: 'User deleted successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to delete user' });
    }
  });

  fastify.patch('/users/:userId/admin', {
    onRequest: [fastify.authenticateAdmin],
  }, async (request, reply) => {
    try {
      const { prisma } = await import('../db/prisma.js');
      const { admin } = request.body;

      if (typeof admin !== 'boolean') {
        return reply.code(400).send({ error: 'admin must be a boolean' });
      }

      const user = await prisma.user.findUnique({
        where: { id: BigInt(request.params.userId) },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      if (user.id.toString() === request.user.id.toString()) {
        return reply.code(400).send({ error: 'Cannot modify your own admin status' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: BigInt(request.params.userId) },
        data: { admin },
      });

      return reply.send({
        id: updatedUser.id.toString(),
        emailAddress: updatedUser.emailAddress,
        admin: updatedUser.admin,
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to update user' });
    }
  });
}
