import type { Agent, PackType } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helper: derive stats from overall + position                       */
/* ------------------------------------------------------------------ */
function deriveStats(
  overall: number,
  position: string,
): { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number } {
  const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));
  const base = overall;

  if (position === 'GK') {
    return {
      pace: clamp(base - 12),
      shooting: clamp(base - 20),
      passing: clamp(base - 8),
      dribbling: clamp(base - 15),
      defending: clamp(base + 4),
      physical: clamp(base + 2),
    };
  }
  if (position === 'CB') {
    return {
      pace: clamp(base - 6),
      shooting: clamp(base - 14),
      passing: clamp(base - 4),
      dribbling: clamp(base - 10),
      defending: clamp(base + 6),
      physical: clamp(base + 4),
    };
  }
  if (position === 'LB' || position === 'RB') {
    return {
      pace: clamp(base + 2),
      shooting: clamp(base - 10),
      passing: clamp(base),
      dribbling: clamp(base - 4),
      defending: clamp(base + 4),
      physical: clamp(base + 2),
    };
  }
  if (position === 'CDM') {
    return {
      pace: clamp(base - 4),
      shooting: clamp(base - 8),
      passing: clamp(base + 4),
      dribbling: clamp(base - 2),
      defending: clamp(base + 4),
      physical: clamp(base + 3),
    };
  }
  if (position === 'CM') {
    return {
      pace: clamp(base - 2),
      shooting: clamp(base - 4),
      passing: clamp(base + 6),
      dribbling: clamp(base + 2),
      defending: clamp(base),
      physical: clamp(base),
    };
  }
  if (position === 'CAM') {
    return {
      pace: clamp(base + 2),
      shooting: clamp(base + 2),
      passing: clamp(base + 6),
      dribbling: clamp(base + 4),
      defending: clamp(base - 10),
      physical: clamp(base - 4),
    };
  }
  if (position === 'LW' || position === 'RW') {
    return {
      pace: clamp(base + 6),
      shooting: clamp(base + 2),
      passing: clamp(base),
      dribbling: clamp(base + 4),
      defending: clamp(base - 14),
      physical: clamp(base - 4),
    };
  }
  if (position === 'ST') {
    return {
      pace: clamp(base + 4),
      shooting: clamp(base + 6),
      passing: clamp(base - 4),
      dribbling: clamp(base + 2),
      defending: clamp(base - 16),
      physical: clamp(base + 2),
    };
  }
  // MGR — all equal
  return {
    pace: base,
    shooting: base,
    passing: base,
    dribbling: base,
    defending: base,
    physical: base,
  };
}

function getRarity(overall: number): 'common' | 'rare' | 'epic' | 'legendary' {
  if (overall >= 93) return 'legendary';
  if (overall >= 85) return 'epic';
  if (overall >= 75) return 'rare';
  return 'common';
}

function toKebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/* ------------------------------------------------------------------ */
/*  Deterministic AGENT #XXXX name from ID                             */
/* ------------------------------------------------------------------ */
const _usedNums = new Set<number>();
function genAgentName(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  let n = (Math.abs(h) % 9000) + 1000;
  while (_usedNums.has(n)) n = n + 1 > 9999 ? 1000 : n + 1;
  _usedNums.add(n);
  return `AGENT #${String(n).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Build an agent record                                              */
/* ------------------------------------------------------------------ */
function makeAgent(
  origName: string,
  overall: number,
  techStack: string,
  position: string,
  flavorText: string,
): Agent {
  const id = toKebab(origName);
  const rarity = getRarity(overall);
  return {
    id,
    name: genAgentName(id),
    position: position as Agent['position'],
    overall,
    stats: deriveStats(overall, position),
    rarity,
    flavorText,
    techStack: techStack as Agent['techStack'],
    avatarSvg: '',
  };
}

/* ================================================================== */
/*  ALL 105 AGENTS                                                     */
/* ================================================================== */

export const ALL_AGENTS: Agent[] = [
  /* ───────── Goalkeepers (10) ───────── */
  makeAgent('G-P-T Zero', 92, 'openai', 'GK', 'The Last Wall of Tokens'),
  makeAgent('Claude Keeper', 89, 'anthropic', 'GK', 'Saves with constitutional precision'),
  makeAgent('Gemini Guard', 85, 'google', 'GK', 'Two minds, one glove'),
  makeAgent('Llama Shield', 82, 'meta', 'GK', 'Open-source, closed goal'),
  makeAgent('Mistral Wall', 80, 'mistral', 'GK', 'Le Mur from Marseille'),
  makeAgent('Falcon Reflex', 78, 'open-source', 'GK', 'Swoops on every shot'),
  makeAgent('Grok Fortress', 77, 'independent', 'GK', 'Memes can\'t score past this one'),
  makeAgent('Phi Barrier', 74, 'independent', 'GK', 'Small model, big saves'),
  makeAgent('Orca Sentinel', 72, 'open-source', 'GK', 'Watches the goal like a pod'),
  makeAgent('Stable Wall', 69, 'open-source', 'GK', 'Diffuses every attack'),

  /* ───────── Defenders (25) ───────── */
  makeAgent('Transformer Block', 91, 'openai', 'CB', 'Attention is all you need to block'),
  makeAgent('Attention Stopper', 90, 'openai', 'CB', 'Multi-headed defensive awareness'),
  makeAgent('Gradient Descent', 88, 'independent', 'CB', 'Always finds the lowest point of attack'),
  makeAgent('Backprop Stone', 86, 'independent', 'LB', 'Learns from every mistake'),
  makeAgent('Token Embargo', 85, 'anthropic', 'RB', 'No token passes this line'),
  makeAgent('Layer Norm', 84, 'google', 'CB', 'Normalizes every threat'),
  makeAgent('Dropout Shield', 82, 'meta', 'LB', 'Random but effective'),
  makeAgent('Batch Anchor', 81, 'independent', 'RB', 'Anchors the batch, anchors the defense'),
  makeAgent('Residual Wall', 80, 'independent', 'CB', 'Skip connection to the goal line'),
  makeAgent('Epoch Guard', 79, 'open-source', 'LB', 'Tougher every epoch'),
  makeAgent('Bias Blocker', 78, 'anthropic', 'CB', 'Blocks biased runs'),
  makeAgent('Kernel Crush', 77, 'independent', 'RB', 'Convolves attackers into submission'),
  makeAgent('Softmax Slab', 76, 'google', 'CB', 'Probabilistically impenetrable'),
  makeAgent('Vector Shield', 75, 'meta', 'LB', 'High-dimensional defense'),
  makeAgent('Pooling Wall', 74, 'independent', 'CB', 'Max pools the danger away'),
  makeAgent('Sigmoid Gate', 73, 'independent', 'RB', 'Opens and closes at will'),
  makeAgent('ReLU Rock', 72, 'open-source', 'CB', 'Activates only when needed'),
  makeAgent('Tensor Guard', 71, 'google', 'LB', 'Multi-dimensional awareness'),
  makeAgent('Sparse Stopper', 70, 'mistral', 'CB', 'Efficient tackles, zero waste'),
  makeAgent('Quantize Wall', 69, 'independent', 'RB', 'Compressed but unbreakable'),
  makeAgent('Pruning Axe', 68, 'open-source', 'CB', 'Cuts down every winger'),
  makeAgent('Weight Decay', 67, 'independent', 'LB', 'Regularizes the opposition'),
  makeAgent('Momentum Block', 66, 'independent', 'CB', 'Hard to push past'),
  makeAgent('Adam Anchor', 65, 'open-source', 'RB', 'Optimally positioned always'),
  makeAgent('Loss Barrier', 65, 'independent', 'CB', 'Where attacks go to die'),

  /* ───────── Midfielders (30) ───────── */
  makeAgent('Neural Maestro', 95, 'openai', 'CAM', 'The brain orchestrating every play'),
  makeAgent('Prompt Engineer', 93, 'anthropic', 'CM', 'Crafts the perfect through ball'),
  makeAgent('Context Window', 91, 'anthropic', 'CDM', 'Sees the entire pitch at once'),
  makeAgent('Embedding King', 90, 'openai', 'CAM', 'Represents every dimension of skill'),
  makeAgent('Fine Tune Maestro', 88, 'google', 'CM', 'Adapts to any opponent\'s style'),
  makeAgent('RLHF Anchor', 87, 'anthropic', 'CDM', 'Reinforced by human feedback'),
  makeAgent('Inference Runner', 86, 'openai', 'CM', 'Processes the game at lightning speed'),
  makeAgent('Hallucination Hunter', 85, 'anthropic', 'CDM', 'Spots fake runs instantly'),
  makeAgent('Chain of Thought', 84, 'openai', 'CAM', 'Step-by-step build-up play'),
  makeAgent('Retrieval Maestro', 83, 'google', 'CM', 'Retrieves the ball with augmented skill'),
  makeAgent('Tokenizer Mid', 82, 'openai', 'CM', 'Breaks down play into perfect tokens'),
  makeAgent('Benchmark Boss', 81, 'independent', 'CDM', 'Consistently top of the charts'),
  makeAgent('Pipeline Pro', 80, 'google', 'CM', 'Smooth transitions from defense to attack'),
  makeAgent('Latent Spacer', 79, 'independent', 'CAM', 'Creates space in hidden dimensions'),
  makeAgent('Semantic Searcher', 78, 'google', 'CM', 'Finds meaning in every pass'),
  makeAgent('Perceptron Pass', 77, 'independent', 'CDM', 'Single-layer genius'),
  makeAgent('Few Shot Learner', 76, 'meta', 'CM', 'Adapts with minimal examples'),
  makeAgent('Zero Shot Ace', 75, 'meta', 'CAM', 'No training needed, born ready'),
  makeAgent('Distilled Dynamo', 74, 'open-source', 'CM', 'Compact but explosive'),
  makeAgent('Attention Head', 73, 'independent', 'CDM', 'Watches all 11 opponents simultaneously'),
  makeAgent('Feature Extract', 72, 'google', 'CM', 'Pulls key plays from the noise'),
  makeAgent('Logit Legend', 71, 'independent', 'CM', 'Scores probabilities and goals'),
  makeAgent('Cosine Connector', 70, 'independent', 'CAM', 'Measures similarity between great passes'),
  makeAgent('Entropy Engine', 69, 'open-source', 'CDM', 'Brings chaos to the midfield'),
  makeAgent('Stochastic Spark', 68, 'independent', 'CM', 'Unpredictable but brilliant'),
  makeAgent('Overfitter', 67, 'open-source', 'CM', 'Too adapted to one tactic'),
  makeAgent('Underfitter', 66, 'open-source', 'CDM', 'Simple but effective'),
  makeAgent('Regularizer Rex', 65, 'independent', 'CM', 'Keeps the team balanced'),
  makeAgent('Cross Validator', 64, 'independent', 'CM', 'Tests every approach'),
  makeAgent('Grid Searcher', 63, 'open-source', 'CDM', 'Explores every tactical option'),

  /* ───────── Forwards (30) ───────── */
  makeAgent('GPT Striker', 99, 'openai', 'ST', 'The Original — no defense has an answer'),
  makeAgent('Claude Dribbler', 97, 'anthropic', 'LW', 'Helpful, harmless, but lethal on the ball'),
  makeAgent('Gemini Ultra', 96, 'google', 'ST', 'Multimodal menace in the box'),
  makeAgent('Llama Speedster', 94, 'meta', 'RW', 'Open-source rocket down the wing'),
  makeAgent('Grok Cannon', 93, 'independent', 'ST', 'Shoots truth bombs and screamers'),
  makeAgent('Mistral Dash', 91, 'mistral', 'LW', 'Le vent on the left flank'),
  makeAgent('Perplexity Rocket', 90, 'independent', 'RW', 'Answers every defensive question'),
  makeAgent('Copilot Assist', 89, 'independent', 'ST', 'Always suggests the right run'),
  makeAgent('Devin Dribbler', 88, 'independent', 'LW', 'Autonomous winger, no instructions needed'),
  makeAgent('Cursor Striker', 87, 'independent', 'RW', 'Tab-completes every goal'),
  makeAgent('Stable Diffuser', 86, 'open-source', 'ST', 'Generates goals from noise'),
  makeAgent('Midjourney Messi', 85, 'independent', 'LW', 'Imagines impossible goals'),
  makeAgent('DALL-E Finisher', 84, 'openai', 'RW', 'Paints goals on the canvas'),
  makeAgent('Whisper Winger', 83, 'openai', 'LW', 'So quiet you never hear the goal'),
  makeAgent('Sora Sprinter', 82, 'openai', 'ST', 'Generates runs frame by frame'),
  makeAgent('Cohere Striker', 81, 'independent', 'RW', 'Cohesive attacking play'),
  makeAgent('Jasper Jet', 80, 'independent', 'LW', 'AI-powered speed demon'),
  makeAgent('Runway Rocket', 79, 'independent', 'ST', 'Takes off in the final third'),
  makeAgent('Hugging Facer', 78, 'open-source', 'RW', 'Community-driven goal machine'),
  makeAgent('Replicate Rush', 77, 'independent', 'LW', 'Copies the best finishing moves'),
  makeAgent('Weights Buster', 76, 'open-source', 'ST', 'Heavy shots, light on feet'),
  makeAgent('Notebook Ninety', 75, 'independent', 'RW', 'Jupyter goals in real time'),
  makeAgent('Lambda Launcher', 74, 'independent', 'LW', 'Serverless, but always scores'),
  makeAgent('Docker Dash', 73, 'open-source', 'ST', 'Containerized speed'),
  makeAgent('Kubernetes Kick', 72, 'open-source', 'RW', 'Orchestrates every attack'),
  makeAgent('Terraform Toe', 71, 'independent', 'LW', 'Provisions space in the box'),
  makeAgent('API Ace', 70, 'independent', 'ST', 'Endpoint: top corner'),
  makeAgent('Webhook Whiz', 69, 'open-source', 'RW', 'Triggers at the right moment'),
  makeAgent('Git Pusher', 66, 'open-source', 'ST', 'Force pushes into the net'),
  makeAgent('Stack Overflow', 64, 'open-source', 'LW', 'Copies goals from the community'),

  /* ───────── Managers (5) ───────── */
  makeAgent('Alan Turing 2.0', 99, 'independent', 'MGR', 'Father of the Grid'),
  makeAgent('Yann LeCun Bot', 96, 'meta', 'MGR', 'The Convolutional Commander'),
  makeAgent('Andrej Vision', 94, 'independent', 'MGR', 'Sees plays before they happen'),
  makeAgent('Sam Alt Protocol', 92, 'openai', 'MGR', 'Always ships the winning strategy'),
  makeAgent('Ilya Deep', 90, 'independent', 'MGR', 'Superintelligent tactical mind'),
];

/* ================================================================== */
/*  PACK TYPES                                                         */
/* ================================================================== */

export const PACK_TYPES: PackType[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    priceSol: 0.1,
    cardCount: 5,
    rareGuarantee: 1,
    epicChance: 0.10,
    legendaryChance: 0.02,
    description: 'Begin your journey with 5 random agents',
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    priceSol: 0.25,
    cardCount: 8,
    rareGuarantee: 2,
    epicChance: 0.20,
    legendaryChance: 0.05,
    description: 'Better odds, more agents',
  },
  {
    id: 'elite',
    name: 'Elite Pack',
    priceSol: 0.5,
    cardCount: 12,
    rareGuarantee: 3,
    epicChance: 0.35,
    legendaryChance: 0.12,
    description: 'High-tier agents await',
  },
  {
    id: 'legendary',
    name: 'Legendary Pack',
    priceSol: 1.0,
    cardCount: 15,
    rareGuarantee: 5,
    epicChance: 0.50,
    legendaryChance: 0.25,
    description: 'The ultimate pack for the ultimate collector',
  },
];

/* ================================================================== */
/*  HELPER FUNCTIONS                                                   */
/* ================================================================== */

export function getAgentsByPosition(position: string): Agent[] {
  return ALL_AGENTS.filter((a) => a.position === position);
}

export function getAgentsByRarity(rarity: string): Agent[] {
  return ALL_AGENTS.filter((a) => a.rarity === rarity);
}

export function getAgentsByTechStack(techStack: string): Agent[] {
  return ALL_AGENTS.filter((a) => a.techStack === techStack);
}

export function getAgentById(id: string): Agent | undefined {
  return ALL_AGENTS.find((a) => a.id === id);
}
