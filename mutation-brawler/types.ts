
export type AttackShape = "circle" | "arc" | "line" | "projectile";

export interface Stats {
  maxHp: number;
  hp: number;
  moveSpeed: number;
  gravity: number;
  jumpVelocity: number;
}

export interface Shape {
  scale: number;
  tintClass: string;
}

export interface ProjectileSpec {
  speed: number;
  lifetime: number;
  width: number;
  height: number;
  pierce: number;
}

export interface AttackSpec {
  name: string;
  baseDamage: number;
  baseCooldown: number;
  shape: AttackShape;
  area: number;
  hitstun: number;
  knockback: number;
  startup: number;
  active: number;
  recovery: number;
  projectile?: ProjectileSpec;
}

export interface MutationCard {
  id: string;
  level: number;
  tags: Set<string>;
  applyToAttack: (attack: AttackSpec, level: number) => AttackSpec;
  applyToShape?: (shape: Shape, level: number) => Shape;
  applyToStats?: (stats: Stats, level: number) => Stats;
}

export interface Inventory {
  backpack: MutationCard[];
  socketA: MutationCard[];
  socketB: MutationCard[];
}

export interface StatusEffect {
  kind: 'poison' | 'slow';
  remaining: number; // in seconds
  dps?: number; // for poison
  slowFactor?: number; // for slow
}

export type EnemyType = 'grunt' | 'brute' | 'scout';

export interface Entity {
  id: number;
  x: number;
  y: number; // Corresponds to depth
  z: number; // Corresponds to height
  vx: number;
  vy: number; // Corresponds to depth velocity
  vz: number; // Corresponds to height velocity
  knockbackVx: number;
  knockbackVy: number;
  width: number;
  height: number;
  stats: Stats;
  shape: Shape;
  onGround: boolean;
  direction: 1 | -1;
  isPlayer?: boolean;
  isEnemy?: boolean;
  isBoss?: boolean;
  lastAttackA: number;
  lastAttackB: number;
  lastHit?: number;
  statusEffects: StatusEffect[];
}

export interface Player extends Entity {
  isPlayer: true;
  attackState: { spec: AttackSpec, startedAt: number } | null;
  xp: number;
  level: number;
  xpToNextLevel: number;
  baseAttackA: AttackSpec;
  baseAttackB: AttackSpec;
}

export interface Enemy extends Entity {
  isEnemy: true;
  enemyType: EnemyType;
  isBoss?: boolean;
  lastShot?: number;
  shootCooldown?: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  width: number;
  height: number;
  damage: number;
  ownerId: number;
  expiresAt: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  card: MutationCard;
}

export interface AttackInstance {
    id: number;
    ownerId: number;
    spec: AttackSpec;
    x: number;
    y: number;
    z: number;
    direction: 1 | -1;
    expiresAt: number;
    hitEnemyIds: Set<number>;
    socketSource: 'A' | 'B';
}

export type StatUpgradeType = 'maxHp' | 'moveSpeed' | 'baseDamageA' | 'baseDamageB';
        
export type LevelUpOption = 
    | { type: 'NEW_MUTATION'; card: MutationCard }
    | { type: 'UPGRADE_MUTATION'; card: MutationCard }
    | { type: 'STAT_UPGRADE'; stat: StatUpgradeType; description: string; };
