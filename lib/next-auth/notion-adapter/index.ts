import type { Client } from '@notionhq/client'
import type {
  CreatePageResponse,
  GetPageResponse,
  QueryDatabaseResponse,
  UpdatePageResponse,
} from '@notionhq/client/build/src/api-endpoints'
import type { Account } from 'next-auth'
import type {
  Adapter,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from 'next-auth/adapters'
import type { ProviderType } from 'next-auth/providers'
import pThrottle from 'p-throttle'
import type { F, O, U } from 'ts-toolbelt'
import {
  getFile,
  getProperty,
  richTextToPlainText,
  uuidFromID,
} from '../../notion/utils'

const USER_DB = process.env.NOTION_USER_DB_ID!
const ACCOUNT_DB = process.env.NOTION_ACCOUNT_DB_ID!
const SESSION_DB = process.env.NOTION_SESSION_DB_ID!
const VERIFICATION_TOKEN_DB = process.env.NOTION_VERIFICATION_TOKEN_DB_ID!

const throttle = pThrottle({
  limit: 3,
  interval: 1000,
})

type CreatePageBodyParameters = F.Parameters<
  typeof Client['prototype']['pages']['create']
>[0]['properties']

type QueryDatabaseResult = U.Merge<QueryDatabaseResponse['results'][0]>

export default function NotionAdapter(client: Client, options = {}): Adapter {
  return {
    async createUser(user) {
      const properties: CreatePageBodyParameters = {
        name: {
          title: [
            {
              text: {
                content: user.name as string,
              },
            },
          ],
        },
        email: {
          email: user.email as string,
        },
      }
      if (user.verifiedEmail) {
        properties.emailVerified = {
          number: (user.emailVerified as Date)?.getTime() ?? 0,
        }
      }
      if (user.image) {
        properties.image = {
          files: [
            {
              ...((user.image as string).includes('secure.notion-static.com')
                ? { file: { url: user.image as string }, type: 'file' }
                : {
                    external: { url: user.image as string },
                    type: 'external',
                  }),
              name: 'avatar',
            },
          ],
        }
      }
      const createdUser = await throttledAPICall<U.Merge<CreatePageResponse>>(
        () =>
          client.pages.create({
            parent: { database_id: uuidFromID(USER_DB) },
            properties,
          }),
      )
      if (!createdUser) {
        throw new Error('Failed to create user')
      }
      return parseUser(createdUser) as AdapterUser
    },
    async getUser(id) {
      const user = await throttledAPICall<U.Merge<GetPageResponse>>(() =>
        client.pages.retrieve({
          page_id: uuidFromID(id),
        }),
      )
      return parseUser(user)
    },
    async getUserByEmail(email) {
      const users = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(USER_DB),
          filter: {
            and: [
              {
                property: 'email',
                email: {
                  equals: email,
                },
              },
            ],
          },
        }),
      )
      const user = users?.results?.[0] as U.Merge<
        QueryDatabaseResponse['results'][0]
      >
      return parseUser(user)
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const accounts = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(ACCOUNT_DB),
          filter: {
            and: [
              {
                property: 'provider',
                rich_text: {
                  contains: provider,
                }
              },
              {
                property: 'providerAccountId',
                title: {
                  contains: providerAccountId,
                },
              },
            ],
          },
        }),
      )
      const account = accounts?.results?.[0]
      if (!account) return null
      const users = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(USER_DB),
          filter: {
            and: [
              {
                property: 'accounts',
                relation: {
                  contains: uuidFromID(account.id),
                },
              },
            ],
          },
        }),
      )
      const user = users?.results?.[0] as U.Merge<
        QueryDatabaseResponse['results'][0]
      >
      return parseUser(user)
    },
    async updateUser(user) {
      const properties: CreatePageBodyParameters = {
        name: {
          title: [
            {
              text: {
                content: user.name as string,
              },
            },
          ],
        },
        email: {
          email: user.email as string,
        },
      }
      if (user.verifiedEmail) {
        properties.emailVerified = {
          number: (user.emailVerified as Date)?.getTime() ?? 0,
        }
      }
      if (user.image) {
        properties.image = {
          files: [
            {
              ...((user.image as string).includes('secure.notion-static.com')
                ? { file: { url: user.image as string }, type: 'file' }
                : {
                    external: { url: user.image as string },
                    type: 'external',
                  }),
              name: 'avatar',
            },
          ],
        }
      }
      const updatedUser = await throttledAPICall<U.Merge<UpdatePageResponse>>(
        () =>
          client.pages.update({
            page_id: uuidFromID(user.id),
            properties,
          }),
      )
      if (!updatedUser) {
        throw new Error('Failed to update user')
      }
      return parseUser(updatedUser) as AdapterUser
    },
    async deleteUser(userId) {
      const deletedUser = await throttledAPICall<U.Merge<UpdatePageResponse>>(
        () =>
          client.pages.update({
            page_id: uuidFromID(userId),
            archived: true,
          }),
      )
      return parseUser(deletedUser)
    },
    async linkAccount(account) {
      const properties: CreatePageBodyParameters = {
        userId: {
          relation: [{ id: account.userId }],
        },
        type: {
          select: {
            name: account.provider,
          },
        },
        provider: {
          rich_text: [{ text: { content: account.provider ?? '' } }],
        },
        providerAccountId: {
          title: [{ text: { content: account.providerAccountId ?? '' } }],
        },
      }
      if (account.refresh_token) {
        properties.refresh_token = {
          rich_text: [{ text: { content: account.refresh_token ?? '' } }],
        }
      }
      if (account.access_token) {
        properties.access_token = {
          rich_text: [{ text: { content: account.access_token ?? '' } }],
        }
      }
      if (account.access_token) {
        properties.expires_at = {
          number: account.expires_at ?? 0,
        }
      }
      if (account.token_type) {
        properties.token_type = {
          rich_text: [{ text: { content: account.token_type ?? '' } }],
        }
      }
      if (account.scope) {
        properties.scope = {
          rich_text: [{ text: { content: account.scope ?? '' } }],
        }
      }
      if (account.id_token) {
        properties.id_token = {
          rich_text: [{ text: { content: account.id_token ?? '' } }],
        }
      }
      if (account.session_state) {
        properties.session_state = {
          rich_text: [{ text: { content: account.session_state ?? '' } }],
        }
      }
      if (account.oauth_token_secret) {
        properties.oauth_token_secret = {
          rich_text: [
            { text: { content: (account.oauth_token_secret as string) ?? '' } },
          ],
        }
      }
      if (account.oauth_token) {
        properties.oauth_token = {
          rich_text: [
            { text: { content: (account.oauth_token as string) ?? '' } },
          ],
        }
      }
      const createdAccount = await throttledAPICall<
        U.Merge<CreatePageResponse>
      >(() =>
        client.pages.create({
          parent: { database_id: uuidFromID(ACCOUNT_DB) },
          properties,
        }),
      )
      return parseAccount(createdAccount)
    },
    async unlinkAccount({ providerAccountId, provider }) {
      const accounts = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(ACCOUNT_DB),
          filter: {
            and: [
              {
                property: 'providerAccountId',
                title: {
                  contains: providerAccountId,
                },
              },
            ],
          },
        }),
      )
      const account = accounts?.results?.[0]
      if (account) {
        const deletedAccount = await throttledAPICall<
          U.Merge<UpdatePageResponse>
        >(() =>
          client.pages.update({
            page_id: uuidFromID(account.id),
            archived: true,
          }),
        )
        console.log('Account has deleted', deletedAccount?.id)
      }
    },
    async createSession({ sessionToken, userId, expires }) {
      const createdSession = await throttledAPICall<
        U.Merge<CreatePageResponse>
      >(() =>
        client.pages.create({
          parent: { database_id: uuidFromID(SESSION_DB) },
          properties: {
            userId: {
              relation: [{ id: userId }],
            },
            expires: {
              number: (expires as Date)?.getTime() ?? 0,
            },
            sessionToken: {
              title: [{ text: { content: sessionToken } }],
            },
          },
        }),
      )
      return parseSession(createdSession) as AdapterSession
    },
    async getSessionAndUser(sessionToken) {
      const sessions = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(SESSION_DB),
          filter: {
            and: [
              {
                property: 'sessionToken',
                title: { contains: sessionToken },
              },
            ],
          },
        }),
      )
      const session = sessions?.results?.[0] as QueryDatabaseResult
      if (!session) return null
      const users = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(USER_DB),
          filter: {
            and: [
              {
                property: 'sessions',
                relation: { contains: uuidFromID(session.id) },
              },
            ],
          },
        }),
      )
      const user = users?.results?.[0] as QueryDatabaseResult
      if (!user) return null
      return {
        session: parseSession(session) as AdapterSession,
        user: parseUser(user) as AdapterUser,
      }
    },
    async updateSession({ sessionToken }) {
      const sessions = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(SESSION_DB),
          filter: {
            and: [
              {
                property: 'sessionToken',
                title: { contains: sessionToken },
              },
            ],
          },
        }),
      )
      const session = sessions?.results?.[0]
      if (!session) return null
      const updatedSession = await throttledAPICall<
        U.Merge<UpdatePageResponse>
      >(() =>
        client.pages.update({
          page_id: uuidFromID(session.id),
          properties: {
            sessionToken: {
              title: [{ text: { content: sessionToken } }],
            },
          },
        }),
      )
      return parseSession(updatedSession) as AdapterSession
    },
    async deleteSession(sessionToken) {
      const sessions = await throttledAPICall<QueryDatabaseResponse>(() =>
        client.databases.query({
          database_id: uuidFromID(SESSION_DB),
          filter: {
            and: [
              {
                property: 'sessionToken',
                title: { contains: sessionToken },
              },
            ],
          },
        }),
      )
      const session = sessions?.results?.[0]
      if (!session) return
      const deletedSession = await throttledAPICall<UpdatePageResponse>(() =>
        client.pages.update({
          page_id: uuidFromID(session.id),
          archived: true,
        }),
      )
      console.log('Account has deleted', deletedSession?.id)
    },
    async createVerificationToken({ identifier, expires, token }) {
      const createdVerificationToken = await throttledAPICall<
        U.Merge<CreatePageResponse>
      >(() =>
        client.pages.create({
          parent: { database_id: uuidFromID(VERIFICATION_TOKEN_DB) },
          properties: {
            identifier: {
              title: [{ text: { content: identifier } }],
            },
            expires: {
              number: (expires as Date)?.getTime() ?? 0,
            },
            token: {
              rich_text: [{ text: { content: token } }],
            },
          },
        }),
      )
      if (!createdVerificationToken) return null
      return parseVerificationToken(
        createdVerificationToken,
      ) as VerificationToken
    },
    async useVerificationToken({ identifier, token }) {
      const verificationTokens = await throttledAPICall<
        U.Merge<QueryDatabaseResponse>
      >(() =>
        client.databases.query({
          database_id: uuidFromID(VERIFICATION_TOKEN_DB),
          filter: {
            and: [
              {
                property: 'identifier',
                title: {
                  contains: identifier,
                },
              },
              {
                property: 'token',
                rich_text: {
                  contains: token,
                },
              },
            ],
          },
        }),
      )
      const tokenToVerificate = verificationTokens
        ?.results?.[0] as QueryDatabaseResult
      if (!tokenToVerificate) return null
      await throttledAPICall<U.Merge<UpdatePageResponse>>(() =>
        client.pages.update({
          page_id: uuidFromID(tokenToVerificate.id),
          archived: true,
        }),
      )
      return parseVerificationToken(tokenToVerificate) as VerificationToken
    },
  }
}

async function throttledAPICall<T>(
  fn: (...args: any) => Promise<any>,
): Promise<T | null> {
  try {
    const res = (await throttle(fn)()) as T
    return res
  } catch (error) {
    console.error(error)
    return null
  }
}

function parseUser(
  user: U.Merge<GetPageResponse> | null | undefined,
): AdapterUser | null {
  if (!user) return null
  const emailVerified = getProperty(user.properties, 'emailVerified', 'number')
  return {
    id: user.id,
    name: richTextToPlainText(getProperty(user.properties, 'name', 'title')),
    email: getProperty(user.properties, 'email', 'email'),
    emailVerified: emailVerified ? new Date(emailVerified) : null,
    image: getFile(getProperty(user.properties, 'image', 'files'))?.[0]?.url,
  }
}

function parseAccount(
  account: U.Merge<GetPageResponse> | null | undefined,
): Account | null {
  if (!account) return null
  return {
    id: richTextToPlainText(getProperty(account.properties, 'id', 'title')),
    userId:
      getProperty(account.properties, 'userId', 'relation')?.[0]?.id || '',
    type: (getProperty(account.properties, 'type', 'select')?.name ||
      'oauth') as ProviderType,
    provider:
      richTextToPlainText(
        getProperty(account.properties, 'provider', 'rich_text'),
      ) ?? '',
    providerAccountId:
      richTextToPlainText(
        getProperty(account.properties, 'providerAccountId', 'title'),
      ) ?? '',
    refresh_token:
      richTextToPlainText(
        getProperty(account.properties, 'refresh_token', 'rich_text'),
      ) ?? '',
    access_token:
      richTextToPlainText(
        getProperty(account.properties, 'access_token', 'rich_text'),
      ) ?? '',
    expires_at:
      getProperty(account.properties, 'expires_at', 'number') || undefined,
    token_type:
      richTextToPlainText(
        getProperty(account.properties, 'token_type', 'rich_text'),
      ) || undefined,
    scope:
      richTextToPlainText(
        getProperty(account.properties, 'scope', 'rich_text'),
      ) || undefined,
    id_token:
      richTextToPlainText(
        getProperty(account.properties, 'id_token', 'rich_text'),
      ) || undefined,
    session_state:
      richTextToPlainText(
        getProperty(account.properties, 'session_state', 'rich_text'),
      ) || undefined,
    oauth_token_secret:
      richTextToPlainText(
        getProperty(account.properties, 'oauth_token_secret', 'rich_text'),
      ) || undefined,
    oauth_token:
      richTextToPlainText(
        getProperty(account.properties, 'oauth_token', 'rich_text'),
      ) || undefined,
  }
}

function parseSession(
  session: U.Merge<GetPageResponse> | null | undefined,
): AdapterSession | null {
  if (!session) return null
  const expires = getProperty(session.properties, 'expires', 'number')
  return {
    id: session.id,
    userId:
      getProperty(session.properties, 'userId', 'relation')?.[0]?.id || '',
    expires: expires ? new Date(expires) : new Date(),
    sessionToken:
      richTextToPlainText(
        getProperty(session.properties, 'sessionToken', 'title'),
      ) || '',
  }
}

function parseVerificationToken(
  session: U.Merge<GetPageResponse> | null | undefined,
): VerificationToken | null {
  if (!session) return null
  const expires = getProperty(session.properties, 'expires', 'number')
  return {
    identifier:
      richTextToPlainText(
        getProperty(session.properties, 'identifier', 'title'),
      ) || '',
    expires: expires ? new Date(expires) : new Date(),
    token:
      richTextToPlainText(
        getProperty(session.properties, 'token', 'rich_text'),
      ) || '',
  }
}
