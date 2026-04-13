import { Position, Formation } from "@/types";

export interface FormationSlot {
  slot: string;
  position: Position;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export const FORMATIONS: Record<Formation, FormationSlot[]> = {
  "4-3-3": [
    { slot: "GK", position: "GK", x: 50, y: 90 },
    { slot: "LB", position: "LB", x: 12, y: 72 },
    { slot: "CB1", position: "CB", x: 35, y: 75 },
    { slot: "CB2", position: "CB", x: 65, y: 75 },
    { slot: "RB", position: "RB", x: 88, y: 72 },
    { slot: "CM1", position: "CM", x: 28, y: 50 },
    { slot: "CM2", position: "CM", x: 50, y: 45 },
    { slot: "CM3", position: "CM", x: 72, y: 50 },
    { slot: "LW", position: "LW", x: 15, y: 22 },
    { slot: "ST", position: "ST", x: 50, y: 15 },
    { slot: "RW", position: "RW", x: 85, y: 22 },
  ],
  "4-4-2": [
    { slot: "GK", position: "GK", x: 50, y: 90 },
    { slot: "LB", position: "LB", x: 12, y: 72 },
    { slot: "CB1", position: "CB", x: 35, y: 75 },
    { slot: "CB2", position: "CB", x: 65, y: 75 },
    { slot: "RB", position: "RB", x: 88, y: 72 },
    { slot: "LM", position: "CM", x: 15, y: 48 },
    { slot: "CM1", position: "CM", x: 38, y: 50 },
    { slot: "CM2", position: "CM", x: 62, y: 50 },
    { slot: "RM", position: "CM", x: 85, y: 48 },
    { slot: "ST1", position: "ST", x: 38, y: 18 },
    { slot: "ST2", position: "ST", x: 62, y: 18 },
  ],
  "3-5-2": [
    { slot: "GK", position: "GK", x: 50, y: 90 },
    { slot: "CB1", position: "CB", x: 25, y: 75 },
    { slot: "CB2", position: "CB", x: 50, y: 78 },
    { slot: "CB3", position: "CB", x: 75, y: 75 },
    { slot: "LM", position: "CM", x: 10, y: 50 },
    { slot: "CDM1", position: "CDM", x: 35, y: 55 },
    { slot: "CAM", position: "CAM", x: 50, y: 40 },
    { slot: "CDM2", position: "CDM", x: 65, y: 55 },
    { slot: "RM", position: "CM", x: 90, y: 50 },
    { slot: "ST1", position: "ST", x: 38, y: 18 },
    { slot: "ST2", position: "ST", x: 62, y: 18 },
  ],
  "4-2-3-1": [
    { slot: "GK", position: "GK", x: 50, y: 90 },
    { slot: "LB", position: "LB", x: 12, y: 72 },
    { slot: "CB1", position: "CB", x: 35, y: 75 },
    { slot: "CB2", position: "CB", x: 65, y: 75 },
    { slot: "RB", position: "RB", x: 88, y: 72 },
    { slot: "CDM1", position: "CDM", x: 35, y: 58 },
    { slot: "CDM2", position: "CDM", x: 65, y: 58 },
    { slot: "LW", position: "LW", x: 18, y: 35 },
    { slot: "CAM", position: "CAM", x: 50, y: 38 },
    { slot: "RW", position: "RW", x: 82, y: 35 },
    { slot: "ST", position: "ST", x: 50, y: 15 },
  ],
};
