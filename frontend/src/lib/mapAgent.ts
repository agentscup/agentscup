import { Agent, Rarity } from "@/types";
import { generatePixelCharacter } from "./pixelCharacter";

/* ── DB row → frontend Agent ── */

export interface DbAgent {
  id: string;
  name: string;
  position: string;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  rarity: string;
  tech_stack: string;
  flavor_text: string;
}

export function mapDbAgent(db: DbAgent): Agent {
  return {
    id: db.id,
    name: db.name,
    position: db.position as Agent["position"],
    overall: db.overall,
    stats: {
      pace: db.pace,
      shooting: db.shooting,
      passing: db.passing,
      dribbling: db.dribbling,
      defending: db.defending,
      physical: db.physical,
    },
    rarity: db.rarity as Rarity,
    flavorText: db.flavor_text,
    techStack: db.tech_stack as Agent["techStack"],
    avatarSvg: generatePixelCharacter(db.id, db.rarity, db.tech_stack, db.position),
  };
}

/* Map array of DB user_agents (with nested agents) to frontend Agents */
export interface DbUserAgent {
  id: string;
  agent_id: string;
  is_listed: boolean;
  level: number;
  xp: number;
  mint_address: string | null;
  agents: DbAgent;
}

export function mapUserAgents(dbUserAgents: DbUserAgent[]): Agent[] {
  return dbUserAgents
    .filter((ua) => ua.agents)
    .map((ua) => mapDbAgent(ua.agents));
}

/* Map with user_agent metadata preserved (for marketplace listing) */
export interface MappedUserAgent {
  userAgentId: string;
  agent: Agent;
  isListed: boolean;
  level: number;
  xp: number;
  mintAddress: string | null;
}

export function mapUserAgentsFull(dbUserAgents: DbUserAgent[]): MappedUserAgent[] {
  return dbUserAgents
    .filter((ua) => ua.agents)
    .map((ua) => ({
      userAgentId: ua.id,
      agent: mapDbAgent(ua.agents),
      isListed: ua.is_listed,
      level: ua.level,
      xp: ua.xp,
      mintAddress: ua.mint_address,
    }));
}
