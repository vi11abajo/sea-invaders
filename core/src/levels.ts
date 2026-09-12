export type Formation = 'grid' | 'wedge' | 'wall' | 'checker' | 'columns' | 'ring';
export type CrabType = 'normal' | 'armored' | 'swift' | 'fanner' | 'diver';

export interface LevelSpec {
  id: number;
  reef: number;
  index: number;
  waves: number;
  formation: Formation;
  rows: number;
  cols: number;
  kinds: CrabType[];
  speedOffset: number;
  fireOffset: number;
  boss?: 1 | 2 | 3 | 4 | 5;
}

/** Filled in Task 3. */
export const LEVELS: readonly LevelSpec[] = [];
