/**
 * 3D Bin Packing Algorithm (TypeScript Implementation)
 * Inspired by the py3dbp logic.
 */

export interface Item {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  weight: number;
  allowRotation: boolean;
  fragility: number; // 1-5 scale
}

export enum RotationType {
  WHD = 0,
  HWD = 1,
  HDW = 2,
  DHW = 3,
  DWH = 4,
  WDH = 5,
}

export interface PackedItem extends Item {
  x: number;
  y: number;
  z: number;
  rotation: RotationType;
  actualWidth: number;
  actualHeight: number;
  actualDepth: number;
}

export interface Bin {
  id: string;
  width: number;
  height: number;
  depth: number;
  maxWeight: number;
}

export interface PackingResult {
  binId: string;
  packed: PackedItem[];
  totalWeight: number;
  efficiency: number;
  totalCBM: number;
  emptyCBM: number;
  emptyPercent: number;
  cartonCount: number;
  weightCapacityPercent: number;
  cogX: number;
  cogZ: number;
  balanceWarning: boolean;
  weight6050Warning: boolean;
}

export class Packer {
  private binTemplate: Omit<Bin, 'id'>;
  private items: Item[] = [];
  private safetyMargin = 0.002; // 0.2% internal protrusion margin
  private targetVolume: number; // Target CBM in cm3

  constructor(binTemplate: Omit<Bin, 'id'>, targetVolumeCBM: number) {
    const scale = Math.pow(0.998, 1/3);
    this.binTemplate = {
      ...binTemplate,
      width: binTemplate.width * scale,
      height: binTemplate.height * scale,
      depth: binTemplate.depth * scale,
    };
    this.targetVolume = targetVolumeCBM * 1000000;
  }

  addItem(item: Item) {
    this.items.push(item);
  }

  private getRotatedDimensions(item: Item, rotation: RotationType): [number, number, number] {
    const { width: w, height: h, depth: d } = item;
    switch (rotation) {
      case RotationType.WHD: return [w, h, d];
      case RotationType.HWD: return [h, w, d];
      case RotationType.HDW: return [h, d, w];
      case RotationType.DHW: return [d, h, w];
      case RotationType.DWH: return [d, w, h];
      case RotationType.WDH: return [w, d, h];
      default: return [w, h, d];
    }
  }

  private intersect(item1: PackedItem, item2: PackedItem): boolean {
    return (
      item1.x < item2.x + item2.actualWidth &&
      item1.x + item1.actualWidth > item2.x &&
      item1.y < item2.y + item2.actualHeight &&
      item1.y + item1.actualHeight > item2.y &&
      item1.z < item2.z + item2.actualDepth &&
      item1.z + item1.actualDepth > item2.z
    );
  }

  private canFit(item: Item, x: number, y: number, z: number, rotation: RotationType, packedItems: PackedItem[]): [boolean, number, number, number] {
    const [aw, ah, ad] = this.getRotatedDimensions(item, rotation);
    
    if (x + aw > this.binTemplate.width || y + ah > this.binTemplate.height || z + ad > this.binTemplate.depth) {
      return [false, aw, ah, ad];
    }

    const tempPacked: PackedItem = {
      ...item,
      x, y, z,
      rotation,
      actualWidth: aw,
      actualHeight: ah,
      actualDepth: ad
    };

    for (const packed of packedItems) {
      if (this.intersect(tempPacked, packed)) {
        return [false, aw, ah, ad];
      }
    }

    return [true, aw, ah, ad];
  }

  packAll(): { results: PackingResult[], unpacked: Item[] } {
    const MAX_ITERATIONS = 100;
    const STAGNATION_LIMIT = 15; // Exit if no improvement for 15 trials
    const TARGET_EFFICIENCY = 98; // Exit if we hit 98% efficiency with no warnings
    
    const baseStrategies = [
      'volume_desc',
      'weight_desc',
      'density_desc',
      'fragility_desc',
      'area_desc'
    ];

    let bestOutcome: { results: PackingResult[], unpacked: Item[] } | null = null;
    let bestScore = -Infinity;
    let stagnationCount = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // First 5 iterations use pure deterministic strategies (no jitter)
      const useJitter = i >= baseStrategies.length;
      const baseStrategy = baseStrategies[i % baseStrategies.length];
      
      const outcome = this.runTrial(baseStrategy, useJitter);
      const score = this.calculateOutcomeScore(outcome);

      if (score > bestScore) {
        bestScore = score;
        bestOutcome = outcome;
        stagnationCount = 0; // Reset stagnation on improvement

        // Check for Early Exit: High efficiency and no safety warnings in any bin
        const avgEfficiency = outcome.results.reduce((acc, r) => acc + r.efficiency, 0) / outcome.results.length;
        const hasWarnings = outcome.results.some(r => r.balanceWarning || r.weight6050Warning);
        
        if (avgEfficiency >= TARGET_EFFICIENCY && !hasWarnings && outcome.unpacked.length === 0) {
          console.log(`Early Exit: Target achieved at iteration ${i}`);
          break;
        }
      } else {
        stagnationCount++;
      }

      if (stagnationCount >= STAGNATION_LIMIT) {
        console.log(`Early Exit: Stagnation reached at iteration ${i}`);
        break;
      }
    }

    return bestOutcome || { results: [], unpacked: this.items };
  }

  private calculateOutcomeScore(outcome: { results: PackingResult[], unpacked: Item[] }): number {
    if (outcome.results.length === 0) return -1000000;

    const totalPackedVol = outcome.results.reduce((acc, r) => acc + r.totalCBM, 0);
    const totalUnpackedVol = outcome.unpacked.reduce((acc, i) => acc + (i.width * i.height * i.depth) / 1000000, 0);
    
    // Penalties
    const unpackedPenalty = totalUnpackedVol * 100;
    const containerCountPenalty = outcome.results.length * 50;
    
    // Safety Penalties (weighted)
    let safetyPenalty = 0;
    outcome.results.forEach((res, idx) => {
      // Last container gets relaxed rules
      const isLast = idx === outcome.results.length - 1;
      if (!isLast) {
        if (res.balanceWarning) safetyPenalty += 20;
        if (res.weight6050Warning) safetyPenalty += 30;
      }
    });

    return totalPackedVol - unpackedPenalty - containerCountPenalty - safetyPenalty;
  }

  private runTrial(strategy: string, jitter: boolean): { results: PackingResult[], unpacked: Item[] } {
    let remainingItems = [...this.items].sort((a, b) => {
      let diff = 0;
      switch (strategy) {
        case 'volume_desc':
          diff = (b.width * b.height * b.depth) - (a.width * a.height * a.depth);
          break;
        case 'weight_desc':
          diff = b.weight - a.weight;
          break;
        case 'density_desc':
          diff = (b.weight / (b.width * b.height * b.depth)) - (a.weight / (a.width * a.height * a.depth));
          break;
        case 'fragility_desc':
          diff = b.fragility - a.fragility; // Tough items (5) first
          break;
        case 'area_desc':
          diff = (b.width * b.depth) - (a.width * a.depth);
          break;
      }

      if (jitter && Math.abs(diff) < 0.1) {
        return Math.random() - 0.5;
      }
      return diff;
    });

    const results: PackingResult[] = [];
    let binCounter = 1;

    while (remainingItems.length > 0) {
      const currentPacked: PackedItem[] = [];
      const stillRemaining: Item[] = [];
      let currentWeight = 0;
      let binItemsCount = 0;

      for (const item of remainingItems) {
        let placed = false;
        const pivotPoints: [number, number, number][] = [[0, 0, 0]];
        for (const p of currentPacked) {
          pivotPoints.push([p.x + p.actualWidth, p.y, p.z]);
          pivotPoints.push([p.x, p.y + p.actualHeight, p.z]);
          pivotPoints.push([p.x, p.y, p.z + p.actualDepth]);
        }
        
        pivotPoints.sort((a, b) => {
          if (a[1] !== b[1]) return a[1] - b[1]; // Floor first
          if (a[2] !== b[2]) return a[2] - b[2]; // Back to front
          return a[0] - b[0]; // Side to side
        });

        for (const [px, py, pz] of pivotPoints) {
          if (placed) break;

          const rotations = item.allowRotation 
            ? [RotationType.WHD, RotationType.HWD, RotationType.HDW, RotationType.DHW, RotationType.DWH, RotationType.WDH]
            : [RotationType.WHD];

          for (const rotation of rotations) {
            const [fits, aw, ah, ad] = this.canFit(item, px, py, pz, rotation, currentPacked);
            
            if (fits && (currentWeight + item.weight <= this.binTemplate.maxWeight)) {
              let stackingOk = true;
              if (py > 0) {
                // Real-life stacking: must be supported by items below
                const itemsBelow = currentPacked.filter(p => 
                  Math.abs((p.y + p.actualHeight) - py) < 0.1 &&
                  px < p.x + p.actualWidth && px + aw > p.x &&
                  pz < p.z + p.actualDepth && pz + ad > p.z
                );
                
                if (itemsBelow.length > 0) {
                  // Check if the item is "hanging" too much
                  const supportArea = itemsBelow.reduce((sum, p) => {
                    const ix0 = Math.max(px, p.x);
                    const ix1 = Math.min(px + aw, p.x + p.actualWidth);
                    const iz0 = Math.max(pz, p.z);
                    const iz1 = Math.min(pz + ad, p.z + p.actualDepth);
                    return sum + (ix1 - ix0) * (iz1 - iz0);
                  }, 0);
                  
                  if (supportArea < (aw * ad) * 0.7) { // 70% support required
                    stackingOk = false;
                  }

                  // Fragility: Lower index (fragile) cannot support higher index (tough)
                  // Prompt: "Items with lower indexes (more fragile) cannot support items with higher indexes."
                  const minFragilityBelow = Math.min(...itemsBelow.map(i => i.fragility));
                  if (minFragilityBelow < item.fragility) {
                    stackingOk = false;
                  }
                  
                  // Gravity: Heaviest on bottom
                  const avgWeightBelow = itemsBelow.reduce((sum, i) => sum + i.weight, 0) / itemsBelow.length;
                  if (item.weight > avgWeightBelow * 1.1) {
                    stackingOk = false;
                  }
                } else {
                  stackingOk = false; // Hanging in air
                }
              }

              if (stackingOk) {
                currentPacked.push({
                  ...item,
                  x: px, y: py, z: pz,
                  rotation,
                  actualWidth: aw, actualHeight: ah, actualDepth: ad
                });
                currentWeight += item.weight;
                placed = true;
                binItemsCount++;
                break;
              }
            }
          }
        }

        if (!placed) {
          stillRemaining.push(item);
        }
      }

      if (binItemsCount === 0) {
        return { results, unpacked: remainingItems };
      }

      const totalVol = currentPacked.reduce((acc, item) => acc + (item.width * item.height * item.depth), 0);
      const totalWt = currentPacked.reduce((sum, i) => sum + i.weight, 0);
      
      const cogX = currentPacked.reduce((sum, i) => sum + (i.x + i.actualWidth / 2) * i.weight, 0) / totalWt;
      const cogZ = currentPacked.reduce((sum, i) => sum + (i.z + i.actualDepth / 2) * i.weight, 0) / totalWt;
      const centerX = this.binTemplate.width / 2;
      const centerZ = this.binTemplate.depth / 2;
      
      const balanceWarning = 
        Math.abs(cogX - centerX) > this.binTemplate.width * 0.05 ||
        Math.abs(cogZ - centerZ) > this.binTemplate.depth * 0.05;

      // 60/50 Rule: No more than 60% weight in any 50% of length (Z)
      const frontWeight = currentPacked.filter(p => (p.z + p.actualDepth / 2) < this.binTemplate.depth / 2)
                                     .reduce((sum, i) => sum + i.weight, 0);
      const backWeight = totalWt - frontWeight;
      const weight6050Warning = frontWeight > totalWt * 0.6 || backWeight > totalWt * 0.6;

      results.push({
        binId: `Container #${binCounter++}`,
        packed: currentPacked,
        totalWeight: totalWt,
        efficiency: (totalVol / this.targetVolume) * 100,
        totalCBM: totalVol / 1000000,
        emptyCBM: (this.targetVolume - totalVol) / 1000000,
        emptyPercent: ((this.targetVolume - totalVol) / this.targetVolume) * 100,
        cartonCount: currentPacked.length,
        weightCapacityPercent: (totalWt / this.binTemplate.maxWeight) * 100,
        cogX,
        cogZ,
        balanceWarning,
        weight6050Warning
      });

      remainingItems = stillRemaining;
    }

    return { results, unpacked: [] };
  }
}
