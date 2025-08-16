
import type { AttackSpec, Stats, Shape } from './types';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const PLAY_AREA_Y_MIN = 280;
export const PLAY_AREA_Y_MAX = 420;
export const GRAVITY = -1200.0;
export const XP_PER_LEVEL = 100;
export const XP_SCALE_FACTOR = 1.2;

export const PLAYER_STATS: Stats = {
    maxHp: 100,
    hp: 100,
    moveSpeed: 220.0,
    gravity: GRAVITY,
    jumpVelocity: 420.0
};

export const PLAYER_SHAPE: Shape = {
    scale: 1.0,
    tintClass: 'bg-green-400',
};

export const BASE_ATTACK_A: AttackSpec = {
    name: "AOE Swipe",
    baseDamage: 10,
    baseCooldown: 0.7,
    shape: "circle",
    area: 50,
    hitstun: 0.15,
    knockback: 120,
    startup: 0.08,
    active: 0.12,
    recovery: 0.3
};

export const BASE_ATTACK_B: AttackSpec = {
    name: "Forward Combo",
    baseDamage: 7,
    baseCooldown: 0.35,
    shape: "line",
    area: 70,
    hitstun: 0.1,
    knockback: 80,
    startup: 0.06,
    active: 0.08,
    recovery: 0.22
};

export const TINT_CLASSES = {
    POISON: 'bg-lime-500',
    SIDEARM: 'bg-sky-400',
    KNOCKBACK: 'bg-orange-400',
    TWINSTRIKE: 'bg-rose-400',
    LONGREACH: 'bg-fuchsia-400',
    CRYO: 'bg-cyan-400',
    ELASTIC: 'bg-indigo-400',
    VIRAL: 'bg-purple-600',
};
