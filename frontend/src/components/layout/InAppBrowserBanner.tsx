"use client";

/**
 * Banner shown when the player is viewing play.agentscup.com inside a
 * social-app in-app browser (X/Twitter, Instagram, Facebook Messenger,
 * TikTok, LinkedIn, etc.). These embedded WebViews:
 *
 *   1. Strip `window.ethereum` so every injected-wallet connector
 *      reports "not installed" and RainbowKit's connect modal falls
 *      back to its empty-state "What is a Wallet?" help screen — the
 *      one users read as "connect is broken".
 *   2. Block universal-link deep-links to wallet apps because the host
 *      app intercepts `about:` / `wc:` schemes before iOS / Android
 *      can route them. Tapping "MetaMask" inside the X in-app browser
 *      does nothing.
 *   3. Often sandbox IndexedDB, so even WalletConnect QR sessions can't
 *      persist state across the connect handshake.
 *
 * The only reliable fix is to open the URL in Safari / Chrome. Every
 * major wallet (Coinbase, MetaMask, Trust, Phantom) also refuses to
 * connect inside these browsers for the same reasons — this isn't our
 * bug to engineer around, it's a platform constraint.
 *
 * We detect the browser via user-agent sniffing (the only signal
 * available) and surface a fixed banner at the top that:
 *   - Explains why connect isn't working here.
 *   - Offers a one-tap copy-URL button so the user can paste into
 *     Safari / Chrome / their wallet's in-app dApp browser.
 *   - Is dismissible so repeat visitors on the same session aren't
 *     nagged.
 */

import { useEffect, useState } from "react";

type InAppBrowser =
  | "x"
  | "instagram"
  | "facebook"
  | "messenger"
  | "tiktok"
  | "linkedin"
  | "telegram"
  | "line"
  | "wechat"
  | "unknown";

/**
 * Detects the most common mobile in-app browsers by user-agent.
 * Order matters — Messenger UA also contains "FBAV" (Facebook app),
 * so we check Messenger first. "Twitter" covers both X iOS and X
 * Android; "TwitterAndroid" is more specific but not always present.
 */
function detectInAppBrowser(): InAppBrowser | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;

  // Wallet in-app browsers are FINE — they're the one case where
  // injected connectors work perfectly. Don't flag them.
  if (/CoinbaseWallet|MetaMask|Trust|Rainbow|Phantom|OKX|imToken/i.test(ua)) {
    return null;
  }

  if (/Twitter|TwitterAndroid/i.test(ua)) return "x";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FB_IAB|FB4A|FBAV/i.test(ua) && /Messenger/i.test(ua))
    return "messenger";
  if (/FBAN|FB_IAB|FB4A|FBAV/i.test(ua)) return "facebook";
  if (/TikTok|ByteLocale|musical_ly/i.test(ua)) return "tiktok";
  if (/LinkedInApp/i.test(ua)) return "linkedin";
  if (/Telegram/i.test(ua)) return "telegram";
  if (/Line\//i.test(ua)) return "line";
  if (/MicroMessenger/i.test(ua)) return "wechat";

  return null;
}

function labelFor(browser: InAppBrowser): string {
  switch (browser) {
    case "x":
      return "X";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "messenger":
      return "Messenger";
    case "tiktok":
      return "TikTok";
    case "linkedin":
      return "LinkedIn";
    case "telegram":
      return "Telegram";
    case "line":
      return "LINE";
    case "wechat":
      return "WeChat";
    default:
      return "this app";
  }
}

const DISMISS_KEY = "agentscup.inapp-warning.dismissed";

export default function InAppBrowserBanner() {
  const [browser, setBrowser] = useState<InAppBrowser | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Skip entirely on desktop / server — browser-only UX.
    if (typeof window === "undefined") return;
    // Session-sticky dismiss. We don't want to spam the banner on
    // every route change after the user explicitly closed it.
    if (window.sessionStorage?.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    setBrowser(detectInAppBrowser());
  }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access blocked — fall back to a prompt the user can
      // manually copy from. Some in-app browsers (notably WeChat) lock
      // navigator.clipboard entirely.
      window.prompt("Copy this URL and open it in Safari or Chrome:", window.location.href);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage?.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — just keep state in React */
    }
  }

  if (!browser || dismissed) return null;

  const label = labelFor(browser);

  return (
    <div
      className="sticky top-0 z-[60] w-full"
      style={{
        background: "linear-gradient(180deg, #3a2a00 0%, #2a1d00 100%)",
        borderBottom: "2px solid #FFD700",
        boxShadow: "inset 0 -2px 0 rgba(139,113,0,0.4), 0 2px 0 0 rgba(0,0,0,0.4)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-[8px] text-[#FFD700] tracking-wider mb-1">
              OPEN IN SAFARI / CHROME
            </p>
            <p className="text-[11px] text-white/80 leading-relaxed">
              You&apos;re inside {label}&apos;s in-app browser — wallet connections don&apos;t work here. Tap the button to copy the link, then open it in Safari, Chrome, or your wallet app&apos;s browser.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={copyUrl}
                className="font-pixel text-[7px] tracking-wider px-3 py-2 bg-[#FFD700] text-[#1a1200] hover:brightness-110 active:brightness-95 transition"
                style={{
                  boxShadow:
                    "inset -2px -2px 0 rgba(139,113,0,0.5), inset 2px 2px 0 rgba(255,244,176,0.5), 0 2px 0 rgba(0,0,0,0.3)",
                }}
              >
                {copied ? "COPIED!" : "COPY LINK"}
              </button>
              <button
                onClick={dismiss}
                className="font-pixel text-[7px] tracking-wider px-3 py-2 border-2 border-white/30 text-white/70 hover:text-white hover:border-white/60 transition"
              >
                DISMISS
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="font-pixel text-xs text-white/60 hover:text-white px-2 leading-none"
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
}
