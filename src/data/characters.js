// Character definitions for Vampire Roguelike Co-op
export const CHARACTERS = [
  {
    id: 'warrior',
    name: 'Воин',
    description: 'Мощный боец ближнего боя с высоким запасом здоровья',
    color: 0xe74c3c,
    colorHex: '#e74c3c',
    hp: 150,
    speed: 160,
    damage: 35,
    attackRange: 90,
    attackSpeed: 1.2, // attacks per second
    attackType: 'melee',
    shape: 'warrior', // drawing hint
    stats: {
      hp: 5,       // 1-5 stars
      speed: 3,
      damage: 4,
      range: 1
    }
  },
  {
    id: 'mage',
    name: 'Маг',
    description: 'Колдун с мощными заклинаниями и уроном по области',
    color: 0x9b59b6,
    colorHex: '#9b59b6',
    hp: 80,
    speed: 150,
    damage: 60,
    attackRange: 200,
    attackSpeed: 0.7,
    attackType: 'aoe',
    shape: 'mage',
    stats: {
      hp: 2,
      speed: 2,
      damage: 5,
      range: 4
    }
  },
  {
    id: 'ranger',
    name: 'Следопыт',
    description: 'Ловкий лучник с большой дальностью и скорострельностью',
    color: 0x27ae60,
    colorHex: '#27ae60',
    hp: 100,
    speed: 185,
    damage: 25,
    attackRange: 260,
    attackSpeed: 2.0,
    attackType: 'ranged',
    shape: 'ranger',
    stats: {
      hp: 3,
      speed: 5,
      damage: 3,
      range: 5
    }
  },
  {
    id: 'healer',
    name: 'Целитель',
    description: 'Поддерживающий боец, исцеляет союзников в бою',
    color: 0xf1c40f,
    colorHex: '#f1c40f',
    hp: 110,
    speed: 165,
    damage: 20,
    attackRange: 180,
    attackSpeed: 1.0,
    attackType: 'heal',
    healAmount: 5, // HP per second to partner
    shape: 'healer',
    stats: {
      hp: 4,
      speed: 3,
      damage: 2,
      range: 3
    }
  }
];

export function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}
