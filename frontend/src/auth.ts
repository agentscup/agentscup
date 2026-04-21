import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import type { Provider } from "next-auth/providers";

/**
 * Auth.js (NextAuth v5) config for X OAuth 2.0 + PKCE.
 *
 * The built-in Twitter provider in `@auth/core@beta` silently breaks
 * when the caller overrides authorization/userinfo/profile because it
 * shallow-merges the user config on top of its internal defaults —
 * partial overrides drop required fields and the flow throws
 * `OAuthProfileParseError` on the callback. We restate every piece
 * explicitly so the provider stays self-contained.
 *
 * We request only `users.read` — the authorization screen shown to
 * users reads "See your profile info" with no tweet, follow, or write
 * access. Any heavy X API reads (follow checks, tweet verification)
 * run later under the app-only Bearer Token, which doesn't need a
 * user-granted scope.
 */
const providers: Provider[] = [];

if (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) {
  providers.push(
    Twitter({
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
      authorization: {
        // x.com for the user-facing authorize page (X's web app),
        // api.twitter.com for the API hosts — that's the split X
        // actually documents. Mixing them up is a known cause of
        // silent 403s on /2/users/me.
        url: "https://x.com/i/oauth2/authorize",
        params: {
          // Add tweet.read alongside users.read — some X app
          // configs reject /2/users/me when only the bare users.read
          // scope is granted. tweet.read is harmless (we don't use
          // it) but unblocks the profile fetch.
          scope: "users.read tweet.read offline.access",
          response_type: "code",
          code_challenge_method: "S256",
        },
      },
      token: { url: "https://api.twitter.com/2/oauth2/token" },
      userinfo: {
        url: "https://api.twitter.com/2/users/me",
        params: {
          // Pull follower count + created_at so the rarity engine can
          // weight big accounts heavily without an extra API call.
          "user.fields":
            "id,name,username,profile_image_url,public_metrics,created_at",
        },
      },
      profile(raw) {
        const src = raw as {
          data?: {
            id?: string;
            name?: string;
            username?: string;
            profile_image_url?: string;
            public_metrics?: { followers_count?: number };
            created_at?: string;
          };
          id?: string;
          name?: string;
          username?: string;
          profile_image_url?: string;
          public_metrics?: { followers_count?: number };
          created_at?: string;
          title?: string;
          detail?: string;
          status?: number;
        };
        const data = src.data ?? src;
        if (!data?.id) {
          console.error(
            "[auth] X /2/users/me response missing id:",
            JSON.stringify(raw)
          );
          const reason =
            src.title || src.detail
              ? `${src.title ?? ""}${src.status ? ` (${src.status})` : ""}: ${src.detail ?? ""}`.trim()
              : "X /2/users/me returned no user data";
          throw new Error(`X profile parse failed — ${reason}`);
        }
        // Stash the metrics-bearing fields under custom keys so the
        // jwt callback can lift them onto the session without a
        // second X API call.
        return {
          id: String(data.id),
          name: data.name ?? data.username ?? null,
          email: null,
          image: data.profile_image_url ?? null,
          xUsername: data.username,
          xFollowerCount: data.public_metrics?.followers_count ?? 0,
          xCreatedAt: data.created_at,
        } as unknown as { id: string; name: string | null; email: null; image: string | null };
      },
    })
  );
}

/**
 * Extra fields we stash on the JWT + session so server code can grab
 * the X identity without re-parsing the provider profile.
 */
declare module "next-auth" {
  interface Session {
    xUserId?: string;
    xHandle?: string;
    xAvatarUrl?: string;
    xFollowerCount?: number;
    xAccountAgeDays?: number;
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    xUserId?: string;
    xHandle?: string;
    xAvatarUrl?: string;
    xFollowerCount?: number;
    xAccountAgeDays?: number;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  // Trust the Vercel / localhost host headers — Auth.js v5 requires
  // this to be explicit outside of its own deployment adapters.
  trustHost: true,
  callbacks: {
    async jwt({ token, profile, user }) {
      // On first sign-in the OAuth profile carries the raw X payload.
      // We thread it through to the session via token fields.
      const raw = profile as
        | {
            data?: {
              id?: string;
              username?: string;
              profile_image_url?: string;
              public_metrics?: { followers_count?: number };
              created_at?: string;
            };
          }
        | undefined;
      const data =
        raw?.data ??
        (raw as typeof raw & {
          id?: string;
          username?: string;
          profile_image_url?: string;
          public_metrics?: { followers_count?: number };
          created_at?: string;
        });
      if (data?.id) token.xUserId = String(data.id);
      if (data?.username) token.xHandle = data.username;
      if (data?.profile_image_url) token.xAvatarUrl = data.profile_image_url;
      if (typeof data?.public_metrics?.followers_count === "number") {
        token.xFollowerCount = data.public_metrics.followers_count;
      }
      if (data?.created_at) {
        const t = Date.parse(data.created_at);
        if (!Number.isNaN(t)) {
          token.xAccountAgeDays = Math.max(
            0,
            Math.floor((Date.now() - t) / 86_400_000)
          );
        }
      }
      // Belt + braces fallback for the user.id from profile().
      if (!token.xUserId && user?.id) token.xUserId = user.id;
      // The custom keys we returned from profile() are mirrored on
      // the user object — pick them up if they made it through.
      const u = user as
        | (typeof user & {
            xUsername?: string;
            xFollowerCount?: number;
            xCreatedAt?: string;
          })
        | undefined;
      if (!token.xHandle && u?.xUsername) token.xHandle = u.xUsername;
      if (token.xFollowerCount == null && typeof u?.xFollowerCount === "number") {
        token.xFollowerCount = u.xFollowerCount;
      }
      if (token.xAccountAgeDays == null && u?.xCreatedAt) {
        const t = Date.parse(u.xCreatedAt);
        if (!Number.isNaN(t)) {
          token.xAccountAgeDays = Math.max(
            0,
            Math.floor((Date.now() - t) / 86_400_000)
          );
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.xUserId = token.xUserId;
      session.xHandle = token.xHandle;
      session.xAvatarUrl = token.xAvatarUrl;
      session.xFollowerCount = token.xFollowerCount;
      session.xAccountAgeDays = token.xAccountAgeDays;
      return session;
    },
  },
  pages: {
    // Send users back to the hero rather than Auth.js's default UI.
    signIn: "/early-access",
  },
});
