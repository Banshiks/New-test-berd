// Enemy type definitions
export const ENEMY_TYPES = {
  slime: {
    id: 'slime',
    name: 'Слизь',
    color: 0x2ecc71,
    size: 16,
    hp: 30,
    speed: 60,
    damage: 8,
    xp: 5,
    shape: 'blob'
  },
  bat: {
    id: 'bat',
    name: 'Летучая мышь',
    color: 0x8e44ad,
    size: 14,
    hp: 20,
    speed: 130,
    damage: 6,
    xp: 6,
    shape: 'bat'
  },
  skeleton: {
    id: 'skeleton',
    name: 'Скелет',
    color: 0xecf0f1,
    size: 18,
    hp: 60,
    speed: 80,
    damage: 15,
    xp: 12,
    shape: 'humanoid'
  },
  ogre: {
    id: 'ogre',
    name: 'Огр',
    color: 0xe67e22,
    size: 28,
    hp: 180,
    speed: 50,
    damage: 30,
    xp: 25,
    shape: 'big'
  },
  boss: {
    id: 'boss',
    name: 'БОСС',
    color: 0xe74c3c,
    size: 45,
    hp: 2000,
    speed: 65,
    damage: 50,
    xp: 500,
    shape: 'boss'
  }
};

// Wave definitions: array of spawn groups per wave
// Each group: { type, count, delay (ms between spawns) }
export const WAVES = [
  // Wave 1 - Tutorial
  [{ type: 'slime', count: 8, delay: 300 }],
  // Wave 2
  [{ type: 'slime', count: 12, delay: 250 }, { type: 'bat', count: 4, delay: 400 }],
  // Wave 3
  [{ type: 'bat', count: 10, delay: 200 }, { type: 'skeleton', count: 3, delay: 500 }],
  // Wave 4
  [{ type: 'slime', count: 15, delay: 200 }, { type: 'skeleton', count: 6, delay: 350 }],
  // Wave 5
  [{ type: 'bat', count: 14, delay: 150 }, { type: 'ogre', count: 2, delay: 600 }],
  // Wave 6
  [{ type: 'skeleton', count: 10, delay: 250 }, { type: 'bat', count: 12, delay: 150 }],
  // Wave 7
  [{ type: 'ogre', count: 4, delay: 500 }, { type: 'slime', count: 20, delay: 150 }],
  // Wave 8
  [{ type: 'skeleton', count: 15, delay: 200 }, { type: 'ogre', count: 5, delay: 400 }],
  // Wave 9
  [{ type: 'bat', count: 20, delay: 100 }, { type: 'ogre', count: 6, delay: 300 }, { type: 'skeleton', count: 10, delay: 200 }],
  // Wave 10 - Boss
  [{ type: 'boss', count: 1, delay: 0 }, { type: 'skeleton', count: 8, delay: 300 }, { type: 'bat', count: 10, delay: 150 }]
];

export function getEnemyType(id) {
  return ENEMY_TYPES[id] || ENEMY_TYPES.slime;
}
