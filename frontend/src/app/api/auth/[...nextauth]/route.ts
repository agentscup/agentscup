import { handlers } from "@/auth";

/**
 * NextAuth (Auth.js v5) catch-all route. Handles:
 *   /api/auth/signin/twitter     → start OAuth
 *   /api/auth/callback/twitter   → OAuth callback (this is the URL
 *                                  registered in X Developer Portal)
 *   /api/auth/signout            → sign out
 *   /api/auth/session            → session JSON
 */
export const { GET, POST } = handlers;
