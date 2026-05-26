// Upgrade pool for level-up selection
export const UPGRADES = [
  {
    id: 'damage_up',
    name: '+25% урон',
    description: 'Все атаки наносят на 25% больше урона',
    icon: 'sword',
    color: 0xe74c3c,
    apply: (stats) => {
      stats.damage = Math.floor(stats.damage * 1.25);
      return stats;
    }
  },
  {
    id: 'speed_up',
    name: '+20% скорость',
    description: 'Скорость передвижения увеличена на 20%',
    icon: 'boot',
    color: 0x3498db,
    apply: (stats) => {
      stats.speed = Math.floor(stats.speed * 1.20);
      return stats;
    }
  },
  {
    id: 'hp_up',
    name: '+40 макс. HP',
    description: 'Максимальное здоровье увеличено на 40',
    icon: 'heart',
    color: 0xe91e63,
    apply: (stats) => {
      stats.maxHp += 40;
      stats.hp += 40;
      return stats;
    }
  },
  {
    id: 'attack_speed_up',
    name: '+25% скорость атаки',
    description: 'Атакуешь на 25% быстрее',
    icon: 'lightning',
    color: 0xf39c12,
    apply: (stats) => {
      stats.attackSpeed = stats.attackSpeed * 1.25;
      return stats;
    }
  },
  {
    id: 'range_up',
    name: '+50 дальность атаки',
    description: 'Дальность всех атак увеличена на 50',
    icon: 'arrow',
    color: 0x1abc9c,
    apply: (stats) => {
      stats.attackRange += 50;
      return stats;
    }
  },
  {
    id: 'regen',
    name: '3 HP/сек',
    description: 'Постоянная регенерация 3 HP в секунду',
    icon: 'cross',
    color: 0x2ecc71,
    apply: (stats) => {
      stats.regen = (stats.regen || 0) + 3;
      return stats;
    }
  },
  {
    id: 'heal_now',
    name: 'Восстановить 50 HP',
    description: 'Немедленно восстанавливает 50 единиц здоровья',
    icon: 'potion',
    color: 0xff6b6b,
    apply: (stats) => {
      stats.hp = Math.min(stats.maxHp, stats.hp + 50);
      return stats;
    }
  },
  {
    id: 'crit_up',
    name: '+20% крит. шанс',
    description: 'Шанс критического удара увеличен на 20%',
    icon: 'star',
    color: 0x9b59b6,
    apply: (stats) => {
      stats.critChance = (stats.critChance || 0) + 0.20;
      return stats;
    }
  }
];

export function getRandomUpgrades(count = 3) {
  const shuffled = [...UPGRADES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getUpgrade(id) {
  return UPGRADES.find(u => u.id === id);
}
