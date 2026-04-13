require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function deriveStats(overall, position) {
  const clamp = (v) => Math.max(1, Math.min(99, Math.round(v)));
  const b = overall;
  if (position === 'GK') return { pace: clamp(b-12), shooting: clamp(b-20), passing: clamp(b-8), dribbling: clamp(b-15), defending: clamp(b+4), physical: clamp(b+2) };
  if (position === 'CB') return { pace: clamp(b-6), shooting: clamp(b-14), passing: clamp(b-4), dribbling: clamp(b-10), defending: clamp(b+6), physical: clamp(b+4) };
  if (position === 'LB' || position === 'RB') return { pace: clamp(b+2), shooting: clamp(b-10), passing: b, dribbling: clamp(b-4), defending: clamp(b+4), physical: clamp(b+2) };
  if (position === 'CDM') return { pace: clamp(b-4), shooting: clamp(b-8), passing: clamp(b+4), dribbling: clamp(b-2), defending: clamp(b+4), physical: clamp(b+3) };
  if (position === 'CM') return { pace: clamp(b-2), shooting: clamp(b-4), passing: clamp(b+6), dribbling: clamp(b+2), defending: b, physical: b };
  if (position === 'CAM') return { pace: b, shooting: clamp(b+2), passing: clamp(b+4), dribbling: clamp(b+4), defending: clamp(b-8), physical: clamp(b-2) };
  if (position === 'ST') return { pace: clamp(b+2), shooting: clamp(b+6), passing: clamp(b-4), dribbling: clamp(b+2), defending: clamp(b-12), physical: clamp(b+2) };
  if (position === 'LW' || position === 'RW') return { pace: clamp(b+4), shooting: clamp(b+2), passing: b, dribbling: clamp(b+4), defending: clamp(b-10), physical: clamp(b-2) };
  return { pace: b, shooting: b, passing: b, dribbling: b, defending: b, physical: b };
}

function getRarity(o) { if (o >= 93) return 'legendary'; if (o >= 85) return 'epic'; if (o >= 75) return 'rare'; return 'common'; }
function toKebab(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

// Generate deterministic AGENT #XXXX name from ID
const _usedNums = new Set();
function genAgentName(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  let n = (Math.abs(h) % 9000) + 1000;
  while (_usedNums.has(n)) n = n + 1 > 9999 ? 1000 : n + 1;
  _usedNums.add(n);
  return `AGENT #${String(n).padStart(4, '0')}`;
}

const raw = [
  ['G-P-T Zero',92,'openai','GK','The Last Wall of Tokens'],
  ['Claude Keeper',89,'anthropic','GK','Saves with constitutional precision'],
  ['Gemini Guard',85,'google','GK','Two minds, one glove'],
  ['Llama Shield',82,'meta','GK','Open-source, closed goal'],
  ['Mistral Wall',80,'mistral','GK','Le Mur from Marseille'],
  ['Falcon Reflex',78,'open-source','GK','Swoops on every shot'],
  ['Grok Fortress',77,'independent','GK','Memes cant score past this one'],
  ['Phi Barrier',74,'independent','GK','Small model, big saves'],
  ['Orca Sentinel',72,'open-source','GK','Watches the goal like a pod'],
  ['Stable Wall',69,'open-source','GK','Diffuses every attack'],
  ['Transformer Block',91,'openai','CB','Attention is all you need to block'],
  ['Attention Stopper',90,'openai','CB','Multi-headed defensive awareness'],
  ['Gradient Descent',88,'independent','CB','Always finds the lowest point of attack'],
  ['Backprop Stone',86,'independent','LB','Learns from every mistake'],
  ['Token Embargo',85,'anthropic','RB','No token passes this line'],
  ['Layer Norm',84,'google','CB','Normalizes every threat'],
  ['Dropout Shield',82,'meta','LB','Random but effective'],
  ['Batch Anchor',81,'independent','RB','Anchors the batch, anchors the defense'],
  ['Residual Wall',80,'independent','CB','Skip connection to the goal line'],
  ['Epoch Guard',79,'open-source','LB','Tougher every epoch'],
  ['Bias Blocker',78,'anthropic','CB','Blocks biased runs'],
  ['Kernel Crush',77,'independent','RB','Convolves attackers into submission'],
  ['Softmax Slab',76,'google','CB','Probabilistically impenetrable'],
  ['Vector Shield',75,'meta','LB','High-dimensional defense'],
  ['Pooling Wall',74,'independent','CB','Max pools the danger away'],
  ['Sigmoid Gate',73,'independent','RB','Opens and closes at will'],
  ['ReLU Rock',72,'open-source','CB','Activates only when needed'],
  ['Tensor Guard',71,'google','LB','Multi-dimensional awareness'],
  ['Sparse Stopper',70,'mistral','CB','Efficient tackles, zero waste'],
  ['Quantize Wall',69,'independent','RB','Compressed but unbreakable'],
  ['Pruning Axe',68,'open-source','CB','Cuts down every winger'],
  ['Weight Decay',67,'independent','LB','Regularizes the opposition'],
  ['Momentum Block',66,'independent','CB','Hard to push past'],
  ['Adam Anchor',65,'open-source','RB','Optimally positioned always'],
  ['Loss Barrier',65,'independent','CB','Where attacks go to die'],
  ['Neural Maestro',95,'openai','CAM','The brain orchestrating every play'],
  ['Prompt Engineer',93,'anthropic','CM','Crafts the perfect through ball'],
  ['Context Window',91,'anthropic','CDM','Sees the entire pitch at once'],
  ['Embedding King',90,'openai','CAM','Represents every dimension of skill'],
  ['Fine Tune Maestro',88,'google','CM','Adapts to any opponents style'],
  ['RLHF Anchor',87,'anthropic','CDM','Reinforced by human feedback'],
  ['Inference Runner',86,'openai','CM','Processes the game at lightning speed'],
  ['Hallucination Hunter',85,'anthropic','CDM','Spots fake runs instantly'],
  ['Chain of Thought',84,'openai','CAM','Step-by-step build-up play'],
  ['Retrieval Maestro',83,'google','CM','Retrieves the ball with augmented skill'],
  ['Tokenizer Mid',82,'openai','CM','Breaks down play into perfect tokens'],
  ['Benchmark Boss',81,'independent','CDM','Consistently top of the charts'],
  ['Pipeline Pro',80,'google','CM','Smooth transitions from defense to attack'],
  ['Latent Spacer',79,'independent','CAM','Creates space in hidden dimensions'],
  ['Semantic Searcher',78,'google','CM','Finds meaning in every pass'],
  ['Perceptron Pass',77,'independent','CDM','Single-layer genius'],
  ['Few Shot Learner',76,'meta','CM','Adapts with minimal examples'],
  ['Zero Shot Ace',75,'meta','CAM','No training needed, born ready'],
  ['Distilled Dynamo',74,'open-source','CM','Compact but explosive'],
  ['Attention Head',73,'independent','CDM','Watches all 11 opponents simultaneously'],
  ['Feature Extract',72,'google','CM','Pulls key plays from the noise'],
  ['Logit Legend',71,'independent','CM','Scores probabilities and goals'],
  ['Cosine Connector',70,'independent','CAM','Measures similarity between great passes'],
  ['Entropy Engine',69,'open-source','CDM','Brings chaos to the midfield'],
  ['Stochastic Spark',68,'independent','CM','Unpredictable but brilliant'],
  ['Overfitter',67,'open-source','CM','Too adapted to one tactic'],
  ['Underfitter',66,'open-source','CDM','Simple but effective'],
  ['Regularizer Rex',65,'independent','CM','Keeps the team balanced'],
  ['Cross Validator',64,'independent','CM','Tests every approach'],
  ['Grid Searcher',63,'open-source','CDM','Explores every tactical option'],
  ['GPT Striker',99,'openai','ST','The Original - no defense has an answer'],
  ['Claude Dribbler',97,'anthropic','LW','Helpful, harmless, but lethal on the ball'],
  ['Gemini Ultra',96,'google','ST','Multimodal menace in the box'],
  ['Llama Speedster',94,'meta','RW','Open-source rocket down the wing'],
  ['Grok Cannon',93,'independent','ST','Shoots truth bombs and screamers'],
  ['Mistral Dash',91,'mistral','LW','Le vent on the left flank'],
  ['Perplexity Rocket',90,'independent','RW','Answers every defensive question'],
  ['Copilot Assist',89,'independent','ST','Always suggests the right run'],
  ['Devin Dribbler',88,'independent','LW','Autonomous winger, no instructions needed'],
  ['Cursor Striker',87,'independent','RW','Tab-completes every goal'],
  ['Stable Diffuser',86,'open-source','ST','Generates goals from noise'],
  ['Midjourney Messi',85,'independent','LW','Imagines impossible goals'],
  ['DALL-E Finisher',84,'openai','RW','Paints goals on the canvas'],
  ['Whisper Winger',83,'openai','LW','So quiet you never hear the goal'],
  ['Sora Sprinter',82,'openai','ST','Generates runs frame by frame'],
  ['Cohere Striker',81,'independent','RW','Cohesive attacking play'],
  ['Jasper Jet',80,'independent','LW','AI-powered speed demon'],
  ['Runway Rocket',79,'independent','ST','Takes off in the final third'],
  ['Hugging Facer',78,'open-source','RW','Community-driven goal machine'],
  ['Replicate Rush',77,'independent','LW','Copies the best finishing moves'],
  ['Weights Buster',76,'open-source','ST','Heavy shots, light on feet'],
  ['Notebook Ninety',75,'independent','RW','Jupyter goals in real time'],
  ['Lambda Launcher',74,'independent','LW','Serverless, but always scores'],
  ['Docker Dash',73,'open-source','ST','Containerized speed'],
  ['Kubernetes Kick',72,'open-source','RW','Orchestrates every attack'],
  ['Terraform Toe',71,'independent','LW','Provisions space in the box'],
  ['API Ace',70,'independent','ST','Endpoint: top corner'],
  ['Webhook Whiz',69,'open-source','RW','Triggers at the right moment'],
  ['Git Pusher',66,'open-source','ST','Force pushes into the net'],
  ['Stack Overflow',64,'open-source','LW','Copies goals from the community'],
  ['Alan Turing 2.0',99,'independent','MGR','Father of the Grid'],
  ['Yann LeCun Bot',96,'meta','MGR','The Convolutional Commander'],
  ['Andrej Vision',94,'independent','MGR','Sees plays before they happen'],
  ['Sam Alt Protocol',92,'openai','MGR','Always ships the winning strategy'],
  ['Ilya Deep',90,'independent','MGR','Superintelligent tactical mind'],
];

const agents = raw.map(([name, overall, techStack, position, flavorText]) => {
  const id = toKebab(name);
  const s = deriveStats(overall, position);
  return {
    id, name: genAgentName(id), position, overall,
    pace: s.pace, shooting: s.shooting, passing: s.passing,
    dribbling: s.dribbling, defending: s.defending, physical: s.physical,
    rarity: getRarity(overall), tech_stack: techStack, flavor_text: flavorText,
  };
});

async function seed() {
  const { error } = await supabase.from('agents').upsert(agents, { onConflict: 'id' });
  if (error) { console.log('SEED ERROR:', error.message); process.exit(1); }
  const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true });
  console.log('Seeded successfully! Total agents:', count);
}
seed();
