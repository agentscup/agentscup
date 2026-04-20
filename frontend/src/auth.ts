import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import type { Provider } from "next-auth/providers";

/**
 * Auth.js (NextAuth v5) config.
 *
 * Uses X's OAuth 2.0 + PKCE flow via the built-in Twitter provider.
 * We request the minimum scopes we need — the same ones listed in our
 * X Developer app submission:
 *
 *   - users.read   → profile (id, username, avatar, follower_count, created_at)
 *   - tweet.read   → user's own timeline for Base-mention scanning +
 *                    confirming the share tweet during claim
 *   - follows.read → follows/:id/:target check for @base + @agentscup
 *
 * The X numeric user id is carried into the JWT + session so server
 * code can fan out to the X API without re-reading the token store.
 *
 * Environment: reads `X_CLIENT_ID`, `X_CLIENT_SECRET`, and
 * `AUTH_SECRET`. If any is missing at boot, Auth.js throws during
 * the first request — we keep the config valid-but-stubby so the
 * early-access page still loads during the pre-OAuth rollout.
 */
// Only register Twitter when both halves of the OAuth credential are
// actually configured. This keeps the /api/auth/providers probe from
// reporting a broken provider during the pre-keys rollout — the
// frontend falls back to the handle-input flow when it sees no
// provider listed.
const providers: Provider[] = [];
if (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) {
  providers.push(
    Twitter({
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "users.read tweet.read follows.read offline.access",
        },
      },
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the access token + X profile id on first sign-in.
      if (account?.access_token) {
        token.xAccessToken = account.access_token;
      }
      if (profile && typeof profile === "object" && "data" in profile) {
        const data = (profile as { data?: { id?: string; username?: string; profile_image_url?: string } }).data;
        if (data?.id) token.xUserId = data.id;
        if (data?.username) token.xHandle = data.username;
        if (data?.profile_image_url) token.xAvatarUrl = data.profile_image_url;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose only non-sensitive bits to the client. The access
      // token stays server-side (read from the JWT directly in
      // server components / route handlers).
      (session as typeof session & { xUserId?: string; xHandle?: string; xAvatarUrl?: string }).xUserId =
        token.xUserId as string | undefined;
      (session as typeof session & { xUserId?: string; xHandle?: string; xAvatarUrl?: string }).xHandle =
        token.xHandle as string | undefined;
      (session as typeof session & { xUserId?: string; xHandle?: string; xAvatarUrl?: string }).xAvatarUrl =
        token.xAvatarUrl as string | undefined;
      return session;
    },
  },
  pages: {
    // Keep users on /early-access rather than Auth.js's default
    // sign-in UI — the landing hero is the "sign-in page" now.
    signIn: "/early-access",
  },
});
