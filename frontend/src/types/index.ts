export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST' | 'MGR';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type TechStack = 'openai' | 'anthropic' | 'google' | 'meta' | 'mistral' | 'open-source' | 'independent';
export type Formation = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1';
export type ListingType = 'fixed' | 'auction';
export type MatchStatus = 'pending' | 'live' | 'finished';

export interface AgentStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface Agent {
  id: string;
  name: string;
  position: Position;
  overall: number;
  stats: AgentStats;
  rarity: Rarity;
  flavorText: string;
  techStack: TechStack;
  avatarSvg: string;
}

export interface UserAgent {
  id: string;
  agent: Agent;
  mintAddress: string;
  level: number;
  xp: number;
  isListed: boolean;
}

export interface Squad {
  id: string;
  name: string;
  formation: Formation;
  chemistry: number;
  positions: Record<string, string>; // position slot -> userAgentId
  managerId?: string;
}

export interface MatchEvent {
  minute: number;
  type: 'goal' | 'shot' | 'save' | 'tackle' | 'pass' | 'yellow_card' | 'red_card' | 'injury' | 'substitution' | 'half_time' | 'full_time' | 'kick_off';
  team: 'home' | 'away';
  agentName: string;
  targetAgentName?: string;
  description: string;
}

export interface Match {
  id: string;
  homePlayer: { walletAddress: string; username?: string };
  awayPlayer: { walletAddress: string; username?: string };
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  events: MatchEvent[];
  entryFeeCup: number;
}

export interface Listing {
  id: string;
  userAgent: UserAgent;
  sellerWallet: string;
  priceCup: number;
  listingType: ListingType;
  expiresAt: string;
  createdAt: string;
}

export interface PackType {
  id: string;
  name: string;
  priceCup: number;
  cardCount: number;
  rareGuarantee: number;
  epicChance: number;
  legendaryChance: number;
  description: string;
}
