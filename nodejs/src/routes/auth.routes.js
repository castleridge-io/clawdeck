import { createAuthService } from '../services/auth.service.js';

export async function authRoutes(fastify) {
  const authService = createAuthService(fastify);

  fastify.post('/register', async (request, reply) => {
    const { emailAddress, password, agentAutoMode, agentName, agentEmoji } = request.body;

    if (!emailAddress) {
      return reply.code(400).send({ error: 'Email address is required' });
    }

    if (!password) {
      return reply.code(400).send({ error: 'Password is required' });
    }

    try {
      const { user, apiToken } = await authService.register(
        emailAddress,
        password,
        agentAutoMode,
        agentName,
        agentEmoji
      );

      const sessionId = await authService.createSession(
        user.id,
        request.ip,
        request.headers['user-agent']
      );
      const token = authService.generateSessionToken(sessionId);

      return reply.code(201).send({
        user: {
          id: user.id.toString(),
          emailAddress: user.emailAddress,
          admin: user.admin,
          agentAutoMode: user.agentAutoMode,
          agentName: user.agentName,
          agentEmoji: user.agentEmoji,
          avatarUrl: user.avatarUrl,
        },
        token,
        apiToken,
      });
    } catch (error) {
      if (error.message === 'User already exists') {
        return reply.code(409).send({ error: error.message });
      }
      if (error.message.includes('Password')) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/login', async (request, reply) => {
    const { emailAddress, password } = request.body;

    if (!emailAddress || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    try {
      const { user, token } = await authService.login(
        emailAddress,
        password,
        request.ip,
        request.headers['user-agent']
      );

      // Get or create API token for the user
      const apiTokenRecord = await authService.getApiToken(user.id);

      return reply.send({
        user: {
          id: user.id.toString(),
          emailAddress: user.emailAddress,
          admin: user.admin,
          agentAutoMode: user.agentAutoMode,
          agentName: user.agentName,
          agentEmoji: user.agentEmoji,
          avatarUrl: user.avatarUrl,
        },
        token,
        apiToken: apiTokenRecord.token,
      });
    } catch (error) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
  });

  fastify.post('/logout', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const sessionId = request.user.sessionId;

      if (sessionId) {
        await authService.logout(sessionId);
      }

      return reply.send({ message: 'Logged out successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to logout' });
    }
  });

  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const user = await authService.getUserById(request.user.id);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({
        id: user.id.toString(),
        emailAddress: user.emailAddress,
        admin: user.admin,
        agentAutoMode: user.agentAutoMode,
        agentName: user.agentName,
        agentEmoji: user.agentEmoji,
        agentLastActiveAt: user.agentLastActiveAt,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch user' });
    }
  });

  fastify.patch('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const user = await authService.updateProfile(request.user.id, request.body);

      return reply.send({
        id: user.id.toString(),
        emailAddress: user.emailAddress,
        admin: user.admin,
        agentAutoMode: user.agentAutoMode,
        agentName: user.agentName,
        agentEmoji: user.agentEmoji,
        avatarUrl: user.avatarUrl,
      });
    } catch (error) {
      if (error.message.includes('Email')) {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to update profile' });
    }
  });

  fastify.post('/me/password', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Current and new password are required' });
    }

    try {
      const user = await authService.getUserById(request.user.id);

      if (!user || !user.passwordDigest) {
        return reply.code(400).send({ error: 'User has no password set' });
      }

      const isValid = await authService.verifyPassword(currentPassword, user.passwordDigest);

      if (!isValid) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      await authService.updatePassword(request.user.id, newPassword);

      return reply.send({ message: 'Password updated successfully' });
    } catch (error) {
      if (error.message.includes('Password')) {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to update password' });
    }
  });

  fastify.get('/me/api-token', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const apiToken = await authService.getApiToken(request.user.id);

      return reply.send({
        token: apiToken.token,
        name: apiToken.name,
        lastUsedAt: apiToken.lastUsedAt,
        createdAt: apiToken.createdAt,
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch API token' });
    }
  });

  fastify.post('/me/api-token/regenerate', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const apiToken = await authService.regenerateApiToken(request.user.id);

      return reply.send({
        token: apiToken.token,
        name: apiToken.name,
        createdAt: apiToken.createdAt,
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to regenerate API token' });
    }
  });
}
