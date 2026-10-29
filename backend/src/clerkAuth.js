const { setSession } = require('./controllers/controllers');
const { browserRequest } = require('./socialAuth');
const { isPostgresConnection } = require('./db/postgresHttpReads');
const { queryPgClient, resolvePostgresAsyncPool, withPgTransaction } = require('./db/pgPoolQuery');
const { activateSubscription } = require('./billing/subscriptions');

const PROVIDER = 'clerk';

function isClerkAuthEnabled() {
  return process.env.CLERK_AUTH_ENABLED === 'true';
}

function authorizedParties() {
  const configured = String(process.env.CLERK_AUTHORIZED_PARTIES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  return ['http://localhost:5173', 'https://all-model-ai.com'];
}

function bearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : '';
}

async function verifyClerkToken(req, token) {
  if (typeof req.app.locals.verifyClerkSession === 'function') {
    return req.app.locals.verifyClerkSession(token);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    const error = new Error('Clerk authentication is not configured.');
    error.status = 503;
    error.code = 'CLERK_NOT_CONFIGURED';
    throw error;
  }
  const { verifyToken } = require('@clerk/express');
  const claims = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties: authorizedParties(),
  });
  const userId = String(claims?.sub || '').trim();
  if (!userId) {
    const error = new Error('Clerk session could not be verified.');
    error.status = 401;
    error.code = 'CLERK_SESSION_INVALID';
    throw error;
  }
  let email = String(claims.email || claims.primary_email_address || '').trim().toLowerCase();
  let name = String(claims.name || '').trim();
  if (!email) {
    const { clerkClient } = require('@clerk/express');
    const user = await clerkClient.users.getUser(userId);
    email = String(user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '').trim().toLowerCase();
    name = name || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('A verified email is required from Clerk.');
    error.status = 403;
    error.code = 'CLERK_EMAIL_REQUIRED';
    throw error;
  }
  return { userId, email, name: name || email.split('@')[0] };
}

function publicClerkUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'user',
  };
}

function resolveSqliteIdentity(database, identity) {
  return database.transaction(() => {
    const linked = database.prepare(
      'SELECT user_id FROM social_identities WHERE provider = ? AND subject = ?',
    ).get(PROVIDER, identity.userId);
    if (linked?.user_id) {
      const user = database.prepare(
        'SELECT id, name, email, role FROM users WHERE id = ?',
      ).get(linked.user_id);
      if (!user) {
        const error = new Error('Clerk account mapping is invalid.');
        error.status = 409;
        error.code = 'CLERK_IDENTITY_CONFLICT';
        throw error;
      }
      return { user, created: false };
    }
    const existingEmail = database.prepare(
      'SELECT id FROM users WHERE lower(trim(email)) = ?',
    ).get(identity.email);
    if (existingEmail) {
      const error = new Error('An AllModelAI account already uses this email. Linking requires proof of both sign-in methods.');
      error.status = 409;
      error.code = 'CLERK_LINK_REQUIRED';
      throw error;
    }
    const id = Number(database.prepare(
      'INSERT INTO users (name, email, password_hash, email_verified, role) VALUES (?, ?, NULL, 1, ?)',
    ).run(identity.name.slice(0, 100), identity.email, 'user').lastInsertRowid);
    database.prepare(
      'INSERT INTO social_identities (provider, subject, user_id) VALUES (?, ?, ?)',
    ).run(PROVIDER, identity.userId, id);
    const user = database.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
    return { user, created: true };
  }).immediate();
}

async function resolvePostgresIdentity(connection, identity) {
  const pool = resolvePostgresAsyncPool(connection);
  if (!pool) {
    const error = new Error('Clerk account storage is unavailable.');
    error.status = 503;
    error.code = 'CLERK_STORE_UNSUPPORTED';
    throw error;
  }
  return withPgTransaction(pool, async (client) => {
    const linked = await queryPgClient(
      client,
      'SELECT user_id FROM social_identities WHERE provider = $1 AND subject = $2',
      [PROVIDER, identity.userId],
    );
    if (linked.rows[0]?.user_id) {
      const user = await queryPgClient(
        client,
        'SELECT id, name, email, role FROM users WHERE id = $1',
        [linked.rows[0].user_id],
      );
      if (!user.rows[0]) {
        const error = new Error('Clerk account mapping is invalid.');
        error.status = 409;
        error.code = 'CLERK_IDENTITY_CONFLICT';
        throw error;
      }
      return { user: user.rows[0], created: false };
    }
    const existingEmail = await queryPgClient(
      client,
      'SELECT id FROM users WHERE lower(trim(email)) = $1',
      [identity.email],
    );
    if (existingEmail.rows[0]) {
      const error = new Error('An AllModelAI account already uses this email. Linking requires proof of both sign-in methods.');
      error.status = 409;
      error.code = 'CLERK_LINK_REQUIRED';
      throw error;
    }
    const inserted = await queryPgClient(
      client,
      'INSERT INTO users (name, email, password_hash, email_verified, role) VALUES ($1, $2, NULL, 1, $3) RETURNING id, name, email, role',
      [identity.name.slice(0, 100), identity.email, 'user'],
    );
    await queryPgClient(
      client,
      'INSERT INTO social_identities (provider, subject, user_id) VALUES ($1, $2, $3)',
      [PROVIDER, identity.userId, inserted.rows[0].id],
    );
    return { user: inserted.rows[0], created: true };
  });
}

async function exchangeClerkSession(req, res) {
  if (!isClerkAuthEnabled()) {
    return res.status(404).json({ message: 'Not found' });
  }
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ code: 'CLERK_SESSION_INVALID', message: 'Clerk sign-in could not be verified.' });
  }
  let identity;
  try {
    identity = await verifyClerkToken(req, token);
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({
      code: error.code || 'CLERK_SESSION_INVALID',
      message: status === 503 ? 'Clerk sign-in is not configured.' : 'Clerk sign-in could not be verified.',
    });
  }

  const connection = req.app.locals.db;
  let resolved;
  try {
    resolved = isPostgresConnection(connection)
      ? await resolvePostgresIdentity(connection, identity)
      : resolveSqliteIdentity(connection.database, identity);
  } catch (error) {
    if (error.code === 'CLERK_LINK_REQUIRED' || error.code === 'CLERK_IDENTITY_CONFLICT') {
      return res.status(error.status).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({ code: 'CLERK_ACCOUNT_FAILED', message: 'The account could not be saved.' });
  }

  if (resolved.created) {
    try {
      if (isPostgresConnection(connection)) {
        const { activateSubscriptionAsync } = require('./billing/subscriptionsAsync');
        await activateSubscriptionAsync(connection, {
          email: resolved.user.email,
          name: resolved.user.name,
          planKey: 'free',
          paymentStatus: 'complimentary',
        });
      } else {
        activateSubscription(connection, {
          email: resolved.user.email,
          name: resolved.user.name,
          planKey: 'free',
          paymentStatus: 'complimentary',
        });
      }
    } catch {
      /* Free plan can be repaired later; the user row already exists. */
    }
  }

  if (resolved.created && String(resolved.user.role || 'user').toLowerCase() === 'owner' && !isPostgresConnection(connection)) {
    connection.database.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(resolved.user.id);
    resolved.user.role = 'user';
  }

  await setSession(req, res, resolved.user, req.body?.rememberMe !== false);
  return res.status(200).json({
    user: publicClerkUser(resolved.user),
    created: resolved.created,
  });
}

function getPublicClerkAuthStatus(_req, res) {
  return res.json({
    enabled: isClerkAuthEnabled() && Boolean(String(process.env.CLERK_SECRET_KEY || '').trim()),
  });
}

module.exports = {
  browserRequest,
  exchangeClerkSession,
  getPublicClerkAuthStatus,
  isClerkAuthEnabled,
};
