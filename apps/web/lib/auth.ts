import { Pool, type PoolClient } from 'pg';
import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins/anonymous';
import { magicLink } from 'better-auth/plugins/magic-link';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import type { AppSession } from './auth-types';

let pool: Pool | undefined;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function preserveAnonymousUserId(data: {
  anonymousUser: { user: { id: string } };
  newUser: {
    user: Record<string, unknown> & { id: string };
    session: Record<string, unknown> & { userId?: string };
  };
}): Promise<void> {
  const anonymousId = data.anonymousUser.user.id;
  const linkedId = data.newUser.user.id;
  if (anonymousId === linkedId) return;

  const client = await getPool().connect();
  try {
    await client.query('begin');
    await mergeLinkedUserIntoAnonymousUser(client, anonymousId, linkedId);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  data.newUser.user.id = anonymousId;
  data.newUser.session.userId = anonymousId;
}

async function mergeLinkedUserIntoAnonymousUser(
  client: PoolClient,
  anonymousId: string,
  linkedId: string,
): Promise<void> {
  const linked = await client.query<{
    email: string;
    name: string;
    image: string | null;
    emailVerified: boolean;
  }>('select email, name, image, "emailVerified" from "user" where id = $1', [linkedId]);

  const linkedUser = linked.rows[0];
  if (!linkedUser) return;

  await client.query('update "account" set "userId" = $1 where "userId" = $2', [anonymousId, linkedId]);
  await client.query('update "session" set "userId" = $1 where "userId" = $2', [anonymousId, linkedId]);
  await client.query('delete from "user" where id = $1', [linkedId]);
  await client.query(
    `update "user"
      set email = $2,
          name = $3,
          image = $4,
          "emailVerified" = $5,
          "isAnonymous" = false,
          role = 'candidate',
          "updatedAt" = now()
      where id = $1`,
    [anonymousId, linkedUser.email, linkedUser.name, linkedUser.image, linkedUser.emailVerified],
  );
}

function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret } };
}

export const auth = betterAuth({
  appName: 'Puente Laboral Panama',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: getPool(),
  socialProviders: googleProvider(),
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'candidate',
        input: false,
      },
      employerOrgId: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      onLinkAccount: preserveAnonymousUserId,
    }),
    magicLink({
      async sendMagicLink({ email, url }) {
        console.info(`[auth] Magic link for ${email}: ${url}`);
      },
    }),
    nextCookies(),
  ],
});

export async function getServerSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session as AppSession | null;
}
