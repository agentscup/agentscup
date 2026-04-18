import Image from "next/image";

/**
 * Full-screen maintenance takeover.
 * Rendered by the root layout when `NEXT_PUBLIC_MAINTENANCE_MODE === "true"`.
 */
export default function MaintenanceScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-12">
      {/* Pitch line / pixel backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full border border-white/[0.04]" />
        <div className="absolute top-0 left-1/2 w-px h-full bg-white/[0.03]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[10%] left-[15%] animate-[pixel-blink_2s_step-end_infinite]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[30%] right-[20%] animate-[pixel-blink_3s_step-end_infinite]" />
        <div className="absolute w-1 h-1 bg-white/20 top-[60%] left-[40%] animate-[pixel-blink_2.5s_step-end_infinite]" />
        <div className="absolute w-1 h-1 bg-[#2eb060]/30 top-[20%] right-[35%] animate-[pixel-blink_1.5s_step-end_infinite]" />
        <div className="absolute w-3 h-3 bg-white/10 top-[70%] right-[15%] animate-[pixel-blink_3s_step-end_infinite]" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative max-w-xl w-full text-center">
        <div className="flex justify-center mb-8">
          <div className="pixel-float" style={{ imageRendering: "pixelated" }}>
            <Image
              src="/trophy.svg"
              alt="Agents Cup Trophy"
              width={96}
              height={96}
              className="drop-shadow-[0_0_20px_rgba(30,143,78,0.4)]"
            />
          </div>
        </div>

        <h1
          className="font-pixel text-xl sm:text-3xl text-white mb-4 tracking-wider"
          style={{ textShadow: "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.5)" }}
        >
          AGENTS CUP
        </h1>

        <div
          className="inline-block px-4 py-2 mb-8 font-pixel text-[8px] sm:text-[10px] tracking-[0.3em]"
          style={{
            background: "#1a1200",
            color: "#FFD700",
            border: "2px solid #FFD700",
            boxShadow:
              "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
            imageRendering: "pixelated",
          }}
        >
          <span className="inline-block w-2 h-2 bg-[#FFD700] mr-2 animate-pulse align-middle" />
          UNDER MAINTENANCE
        </div>

        <div
          className="p-6 sm:p-8 mb-6"
          style={{
            background: "linear-gradient(180deg, #0f2a0f 0%, #0a1e0a 100%)",
            border: "3px solid #1E8F4E",
            boxShadow:
              "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
            imageRendering: "pixelated",
          }}
        >
          <p className="font-pixel text-[9px] sm:text-[11px] text-white leading-relaxed tracking-wider mb-4">
            WE ARE UPGRADING AGENTS CUP.
          </p>
          <p className="text-[11px] sm:text-sm text-white/70 leading-relaxed mb-4">
            The game is temporarily offline while we migrate the on-chain
            infrastructure. All your agents, balances, and progress are safe
            and will carry over.
          </p>
          <p className="text-[11px] sm:text-sm text-white/50 leading-relaxed">
            We will be back shortly. Thank you for your patience.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-pixel text-[7px] sm:text-[8px] text-white/40 tracking-wider">
          <a
            href="https://x.com/agentscup"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#FFD700] transition-colors"
          >
            X / TWITTER ↗
          </a>
          <a
            href="https://pump.fun/coin/FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#FFD700] transition-colors"
          >
            $CUP TOKEN ↗
          </a>
        </div>
      </div>
    </div>
  );
}
