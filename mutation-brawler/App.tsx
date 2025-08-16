
import React, { useState, useEffect, useCallback, useReducer, useRef, memo } from 'react';
import type { Player, Enemy, Projectile, Pickup, AttackSpec, Inventory, MutationCard, AttackInstance, StatusEffect, Entity, EnemyType, LevelUpOption, StatUpgradeType } from './types';
import { GAME_WIDTH, GAME_HEIGHT, PLAY_AREA_Y_MIN, PLAY_AREA_Y_MAX, PLAYER_STATS, PLAYER_SHAPE, BASE_ATTACK_A, BASE_ATTACK_B, GRAVITY, XP_PER_LEVEL, XP_SCALE_FACTOR } from './constants';
import { ALL_MUTATIONS, mut_sidearm } from './game/mutations';
import { composeAttack } from './game/attacks';
import { clamp } from './utils';

// --- GAME STATE & REDUCER ---

interface GameState {
    player: Player;
    enemies: Enemy[];
    projectiles: Projectile[];
    pickups: Pickup[];
    attackInstances: AttackInstance[];
    inventory: Inventory;
    wave: number;
    gameOver: boolean;
    boss: Enemy | null;
    isLevelUpScreenActive: boolean;
    levelUpChoices: LevelUpOption[];
}

type GameAction = 
    | { type: 'TICK'; payload: Partial<GameState> } 
    | { type: 'RESTART' }
    | { type: 'LEVEL_UP_START'; payload: { choices: LevelUpOption[] } }
    | { type: 'LEVEL_UP_SELECT'; payload: { choice: LevelUpOption } };

let entityIdCounter = 0;
const nextId = () => ++entityIdCounter;

// Pure function to add/stack a card in inventory, returns a new inventory object.
function addCardToInventory(inventory: Inventory, newCard: MutationCard): Inventory {
    const newInventory = structuredClone(inventory);
    let cardFound = false;

    for (const socket of ['socketA', 'socketB', 'backpack'] as const) {
        const cardIndex = newInventory[socket].findIndex((c: MutationCard) => c.id === newCard.id);
        if (cardIndex !== -1) {
            newInventory[socket][cardIndex].level++;
            cardFound = true;
            break;
        }
    }

    if (!cardFound && newInventory.backpack.length < 6) {
        newInventory.backpack.push(newCard);
    }

    return newInventory;
}

function createInitialPlayer(): Player {
    return {
        id: nextId(),
        isPlayer: true,
        x: 100, y: 320, z: 0,
        vx: 0, vy: 0, vz: 0,
        knockbackVx: 0, knockbackVy: 0,
        width: 28, height: 36,
        stats: { ...PLAYER_STATS },
        shape: { ...PLAYER_SHAPE },
        onGround: true,
        direction: 1,
        lastAttackA: 0, lastAttackB: 0,
        statusEffects: [],
        attackState: null,
        xp: 0,
        level: 1,
        xpToNextLevel: XP_PER_LEVEL,
        baseAttackA: { ...BASE_ATTACK_A },
        baseAttackB: { ...BASE_ATTACK_B },
    };
}

// --- Spawner Functions ---

const ENEMY_SPECS = {
    grunt: {
        width: 28, height: 32,
        stats: { maxHp: 30, hp: 30, moveSpeed: 120, gravity: GRAVITY, jumpVelocity: 0 },
        tintClass: 'bg-red-600',
        damage: 4,
        knockback: 40,
        xpValue: 10,
    },
    scout: {
        width: 24, height: 28,
        stats: { maxHp: 20, hp: 20, moveSpeed: 180, gravity: GRAVITY, jumpVelocity: 0 },
        tintClass: 'bg-red-400',
        damage: 3,
        knockback: 30,
        xpValue: 12,
    },
    brute: {
        width: 34, height: 38,
        stats: { maxHp: 60, hp: 60, moveSpeed: 90, gravity: GRAVITY, jumpVelocity: 0 },
        tintClass: 'bg-red-800',
        damage: 10,
        knockback: 80,
        xpValue: 20,
    }
};


function weightedChoice<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        if (random < weights[i]) return items[i];
        random -= weights[i];
    }
    return items[items.length - 1];
};

function spawnPickup(x: number, y: number): Pickup {
    const rarities = [
        { name: 'common', p: 0.70, levels: [0, 1], weights: [2, 8] },
        { name: 'uncommon', p: 0.25, levels: [1, 2], weights: [5, 5] },
        { name: 'rare', p: 0.05, levels: [2, 3], weights: [6, 4] },
    ];
    const rarity = weightedChoice(rarities, rarities.map(r => r.p));
    
    const cardFactory = ALL_MUTATIONS[Math.floor(Math.random() * ALL_MUTATIONS.length)];
    const level = weightedChoice(rarity.levels, rarity.weights);

    return { id: nextId(), x, y, z: 0, width: 18, height: 18, card: cardFactory(level) };
}

function spawnEnemy(wave: number): Enemy {
    const x = Math.random() * (GAME_WIDTH - 100) + 50;
    const y = Math.random() * (PLAY_AREA_Y_MAX - PLAY_AREA_Y_MIN) + PLAY_AREA_Y_MIN;
    
    let enemyType: EnemyType = 'grunt';
    if (wave >= 4) {
        enemyType = weightedChoice(['grunt', 'scout', 'brute'], [0.4, 0.3, 0.3]);
    } else if (wave >= 2) {
        enemyType = weightedChoice(['grunt', 'scout'], [0.6, 0.4]);
    }
    
    const spec = ENEMY_SPECS[enemyType];

    return {
        id: nextId(), isEnemy: true,
        enemyType: enemyType,
        x, y, z: 0,
        vx: 0, vy: 0, vz: 0,
        knockbackVx: 0, knockbackVy: 0,
        width: spec.width, height: spec.height,
        stats: { ...spec.stats },
        shape: { scale: 1, tintClass: '' },
        onGround: true, direction: -1,
        lastAttackA: 0, lastAttackB: 0, statusEffects: []
    };
}

function spawnBoss(): Enemy {
    return {
        id: nextId(), isEnemy: true, isBoss: true, enemyType: 'brute',
        x: GAME_WIDTH / 2 - 20, y: 350, z: 0,
        vx: 0, vy: 0, vz: 0,
        knockbackVx: 0, knockbackVy: 0,
        width: 36, height: 40,
        stats: { maxHp: 220, hp: 220, moveSpeed: 140, gravity: GRAVITY, jumpVelocity: 0 },
        shape: { scale: 1, tintClass: '' },
        onGround: true, direction: -1,
        lastAttackA: 0, lastAttackB: 0, statusEffects: [],
        shootCooldown: 1200, lastShot: 0,
    };
}

const createInitialState = (): GameState => ({
    player: createInitialPlayer(),
    enemies: Array.from({ length: 3 }, () => spawnEnemy(1)),
    projectiles: [],
    pickups: [],
    attackInstances: [],
    inventory: { backpack: [], socketA: [], socketB: [] },
    wave: 1,
    gameOver: false,
    boss: null,
    isLevelUpScreenActive: false,
    levelUpChoices: [],
});

function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'TICK':
            return { ...state, ...action.payload };
        case 'RESTART':
            entityIdCounter = 0;
            return createInitialState();
        case 'LEVEL_UP_START':
            return { ...state, isLevelUpScreenActive: true, levelUpChoices: action.payload.choices };
        case 'LEVEL_UP_SELECT': {
            const { choice } = action.payload;
            const newState = structuredClone(state) as GameState;
            const { player } = newState;
            
            if (choice.type === 'NEW_MUTATION') {
                newState.inventory = addCardToInventory(newState.inventory, choice.card);
            } else if (choice.type === 'UPGRADE_MUTATION') {
                // Since addCardToInventory handles stacking, we just call it with the base version of the card.
                newState.inventory = addCardToInventory(newState.inventory, { ...choice.card, level: 1 });
            } else if (choice.type === 'STAT_UPGRADE') {
                switch(choice.stat) {
                    case 'maxHp':
                        player.stats.maxHp += 20;
                        player.stats.hp += 20;
                        break;
                    case 'moveSpeed':
                        player.stats.moveSpeed *= 1.10;
                        break;
                    case 'baseDamageA':
                        player.baseAttackA.baseDamage *= 1.15;
                        break;
                    case 'baseDamageB':
                        player.baseAttackB.baseDamage *= 1.15;
                        break;
                }
            }

            player.xp -= player.xpToNextLevel;
            player.level++;
            player.xpToNextLevel = Math.floor(player.xpToNextLevel * XP_SCALE_FACTOR);
            player.stats.hp = player.stats.maxHp; // Heal on level up
            
            return { ...newState, isLevelUpScreenActive: false, levelUpChoices: [] };
        }
        default:
            return state;
    }
}

// --- 3D & HELPER COMPONENTS (Memoized for performance) ---

const Brick = memo(({ w, h, d, tintClass, scale = 1, className = '' }: { w: number; h: number; d: number; tintClass: string; scale?: number; className?: string }) => (
    <div className={`preserve-3d ${className}`} style={{ transform: `scale(${scale})` }}>
      <div style={{ width: w, height: h, transform: `translateZ(${d / 2}px)` }} className={`face ${tintClass}`} />
      <div style={{ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` }} className={`face ${tintClass}`} />
      <div style={{ width: w, height: d, transform: `rotateX(90deg) translateZ(${h / 2}px)` }} className={`face ${tintClass} brightness-125`} />
      <div style={{ width: w, height: d, transform: `rotateX(-90deg) translateZ(${h / 2}px)` }} className={`face ${tintClass} brightness-75`} />
      <div style={{ width: d, height: h, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }} className={`face ${tintClass} brightness-90`} />
      <div style={{ width: d, height: h, transform: `rotateY(90deg) translateZ(${w / 2}px)` }} className={`face ${tintClass} brightness-110`} />
    </div>
));

const ShadowComponent = memo(({ entity }: { entity: Entity }) => (
    <div className="absolute bg-black/30 rounded-full blur-sm" style={{
        left: entity.x,
        top: entity.y + entity.height - 4, // Position shadow at feet
        width: entity.width,
        height: 8,
        opacity: Math.max(0, 1 - entity.z / 100), // Fade out as height increases
        transform: `scale(${1 - entity.z/200})`
    }} />
));

const PlayerComponent = memo(({ entity }: { entity: Player }) => {
    let animClass = '';
    if (entity.attackState) {
        if (entity.attackState.spec.name.includes("Swipe")) animClass = 'anim-swipe';
        if (entity.attackState.spec.name.includes("Combo")) animClass = 'anim-lunge';
    }

    return (
        <>
            <ShadowComponent entity={entity} />
            <div className="absolute preserve-3d" style={{ left: entity.x, top: entity.y - entity.z, width: entity.width, height: entity.height }}>
                <Brick w={entity.width} h={entity.height} d={entity.width} tintClass={entity.shape.tintClass} scale={entity.shape.scale} className={animClass} />
            </div>
        </>
    );
});

const EnemyComponent = memo(({ entity }: { entity: Enemy }) => {
    const color = entity.isBoss ? 'bg-blue-600' : ENEMY_SPECS[entity.enemyType].tintClass;
    return (
        <>
            <ShadowComponent entity={entity} />
            <div className="absolute preserve-3d" style={{ left: entity.x, top: entity.y - entity.z, width: entity.width, height: entity.height }}>
                <Brick w={entity.width} h={entity.height} d={entity.width} tintClass={color} />
                <div className="absolute w-full" style={{ top: -12, transform: 'rotateZ(45deg) rotateX(-50deg)' }}>
                    <div className="bg-gray-700 h-1 mx-auto" style={{ width: entity.width }}>
                        <div className="bg-green-500 h-1" style={{ width: `${(entity.stats.hp / entity.stats.maxHp) * 100}%` }} />
                    </div>
                </div>
            </div>
        </>
    );
});

const ProjectileComponent = memo(({ p }: { p: Projectile }) => (
    <>
        <ShadowComponent entity={{...p, knockbackVx: 0, knockbackVy: 0, vy: 0, vz: 0, stats: {} as any, shape: {} as any, onGround: false, direction: 1, lastAttackA: 0, lastAttackB: 0, statusEffects: [] }} />
        <div className="absolute preserve-3d" style={{ left: p.x, top: p.y - p.z, width: p.width, height: p.height }}>
            <Brick w={p.width} h={p.height} d={p.width * 2} tintClass="bg-yellow-300" />
        </div>
    </>
));

const PickupComponent = memo(({ p }: { p: Pickup }) => (
    <div className="absolute preserve-3d" style={{ left: p.x, top: p.y - p.z, width: p.width, height: p.height }}>
        <div className="spinning-brick preserve-3d">
            <Brick w={p.width} h={p.height} d={p.width} tintClass="bg-gradient-to-br from-lime-300 to-green-500" />
        </div>
        <div className="absolute text-center w-full" style={{ top: p.height, transform: 'rotateZ(45deg) rotateX(-50deg)' }}>
             <span className="text-xs text-black bg-white/80 px-1 rounded-sm">{p.card.id} (L{p.card.level})</span>
        </div>
    </div>
));

const AttackEffect = memo(({ attack }: { attack: AttackInstance }) => {
    if (attack.spec.shape === 'circle') {
        return <div className="absolute bg-white/20 rounded-full" style={{
            left: attack.x - attack.spec.area,
            top: attack.y - attack.spec.area - attack.z,
            width: attack.spec.area * 2,
            height: attack.spec.area * 2
        }} />;
    }
    if (attack.spec.shape === 'line') {
        const left = attack.direction > 0 ? attack.x : attack.x - attack.spec.area;
        return <div className="absolute bg-white/20" style={{
            left: left,
            top: attack.y - 20 - attack.z,
            width: attack.spec.area,
            height: 40
        }} />;
    }
    return null;
});

const getTagsFromCards = (cards: MutationCard[]): Set<string> => {
    return new Set(cards.flatMap(c => Array.from(c.tags)));
};

const InstructionsModal = ({ onClose }: { onClose: () => void }) => {
    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 border-2 border-green-400 rounded-lg p-8 max-w-lg w-full text-white shadow-2xl shadow-green-500/20">
                <h1 className="text-3xl font-bold text-green-400 mb-4 text-center">How to Play</h1>
                <p className="text-center mb-6 text-gray-300">Survive waves of enemies, collect mutations, and become the ultimate brawler!</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                    <div>
                        <h2 className="text-xl font-semibold text-lime-300 mb-2">Controls</h2>
                        <ul className="space-y-2">
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">A/D</kbd> or <kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">←/→</kbd> - Move Left/Right</li>
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">W/S</kbd> or <kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">↑/↓</kbd> - Move Up/Down</li>
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">Space</kbd> - Jump</li>
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">J / Z</kbd> - Attack A (Swipe)</li>
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">K / X</kbd> - Attack B (Combo)</li>
                        </ul>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-sky-300 mb-2">Mutations</h2>
                        <p className="mb-2 text-gray-400">Walk over green items to add them to your backpack. Mutations will stack and level up if you pick up a duplicate!</p>
                         <ul className="space-y-2">
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">1</kbd> - Equip newest mutation to Attack A</li>
                            <li><kbd className="px-2 py-1 bg-gray-900 rounded-md font-mono">2</kbd> - Equip newest mutation to Attack B</li>
                        </ul>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-green-500 text-black font-bold rounded-lg shadow-lg hover:bg-green-400 transition-transform transform hover:scale-105"
                    >
                        Start Brawling!
                    </button>
                </div>
            </div>
        </div>
    );
};

const LevelUpModal = ({ choices, onSelect }: { choices: LevelUpOption[], onSelect: (choice: LevelUpOption) => void }) => {
    const getOptionDetails = (choice: LevelUpOption) => {
        switch (choice.type) {
            case 'NEW_MUTATION':
                return { title: `New: ${choice.card.id}`, description: 'Add a new mutation to your backpack.' };
            case 'UPGRADE_MUTATION':
                return { title: `Upgrade: ${choice.card.id}`, description: `Increase ${choice.card.id} to Level ${choice.card.level + 1}.` };
            case 'STAT_UPGRADE':
                return { title: 'Stat Boost', description: choice.description };
        }
    };

    return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
            <h1 className="text-5xl font-bold text-green-400 mb-8 animate-pulse">LEVEL UP!</h1>
            <h2 className="text-2xl text-white mb-8">Choose your upgrade:</h2>
            <div className="flex gap-8">
                {choices.map((choice, i) => {
                    const { title, description } = getOptionDetails(choice);
                    return (
                        <button
                            key={i}
                            onClick={() => onSelect(choice)}
                            className="bg-gray-800 border-2 border-green-500 rounded-lg p-6 w-64 text-white hover:bg-green-900 hover:border-lime-300 transition-all transform hover:-translate-y-2"
                        >
                            <h3 className="text-xl font-bold text-lime-300 mb-3">{title}</h3>
                            <p className="text-gray-300">{description}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

export default function App() {
    const [state, dispatch] = useReducer(gameReducer, createInitialState());
    const [showInstructions, setShowInstructions] = useState(true);
    const keys = useRef<Record<string, boolean>>({}).current;
    const lastTime = useRef(performance.now());
    const gameLoopRef = useRef<number>();
    
    const { player, inventory } = state;

    const generateLevelUpChoices = useCallback((): LevelUpOption[] => {
        const choices: LevelUpOption[] = [];
        const existingCardIds = new Set<string>();
        const allOwnedCards: MutationCard[] = [...inventory.backpack, ...inventory.socketA, ...inventory.socketB];
        allOwnedCards.forEach(c => existingCardIds.add(c.id));

        // Attempt to add one of each type of choice
        // 1. Upgrade an existing card
        if (allOwnedCards.length > 0) {
            const cardToUpgrade = allOwnedCards[Math.floor(Math.random() * allOwnedCards.length)];
            choices.push({ type: 'UPGRADE_MUTATION', card: cardToUpgrade });
        }

        // 2. New mutation card
        const availableNewCards = ALL_MUTATIONS.filter(factory => !existingCardIds.has(factory(1).id));
        if (availableNewCards.length > 0) {
            const newCardFactory = availableNewCards[Math.floor(Math.random() * availableNewCards.length)];
            choices.push({ type: 'NEW_MUTATION', card: newCardFactory(1) });
        }

        // 3. Stat upgrade
        const statUpgradeOptions: { stat: StatUpgradeType; description: string }[] = [
            { stat: 'maxHp', description: `+20 Max HP (Current: ${player.stats.maxHp})` },
            { stat: 'moveSpeed', description: `+10% Move Speed` },
            { stat: 'baseDamageA', description: `+15% Swipe Damage` },
            { stat: 'baseDamageB', description: `+15% Combo Damage` },
        ];
        choices.push({ type: 'STAT_UPGRADE', ...statUpgradeOptions[Math.floor(Math.random() * statUpgradeOptions.length)] });

        // Fill up to 3 choices if we couldn't generate one of each type
        while (choices.length < 3 && availableNewCards.length > choices.filter(c => c.type === 'NEW_MUTATION').length) {
             const newCardFactory = availableNewCards[Math.floor(Math.random() * availableNewCards.length)];
             choices.push({ type: 'NEW_MUTATION', card: newCardFactory(1) });
        }
         while (choices.length < 3) {
            choices.push({ type: 'STAT_UPGRADE', ...statUpgradeOptions[Math.floor(Math.random() * statUpgradeOptions.length)] });
        }

        // Return a unique, shuffled set of 3
        const uniqueChoices = Array.from(new Map(choices.map(c => [JSON.stringify(c), c])).values());
        return uniqueChoices.sort(() => 0.5 - Math.random()).slice(0, 3);
    }, [inventory, player.stats.maxHp]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
        const handleKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [keys]);

    const gameLoop = useCallback((now: number) => {
        const dt = (now - lastTime.current) / 1000;
        lastTime.current = now;

        // Clone state so special objects like Sets remain intact.
        let { player, enemies, projectiles, pickups, attackInstances, inventory, wave, boss } = structuredClone(state) as GameState;

        if (player.attackState && now - player.attackState.startedAt > (player.attackState.spec.active + player.attackState.spec.recovery) * 1000) {
            player.attackState = null;
        }

        // Quick assign mutations
        if (keys['Digit1'] && inventory.backpack.length > 0) {
            inventory.socketA = [inventory.backpack[inventory.backpack.length - 1]];
            keys['Digit1'] = false; 
        }
        if (keys['Digit2'] && inventory.backpack.length > 0) {
            inventory.socketB = [inventory.backpack[inventory.backpack.length - 1]];
            keys['Digit2'] = false;
        }

        // Update player shape based on sockets
        const allSocketCards = [...inventory.socketA, ...inventory.socketB];
        player.shape = allSocketCards.reduce((currentShape, card) => {
            if (card.applyToShape) {
                return card.applyToShape(currentShape, card.level);
            }
            return currentShape;
        }, { ...PLAYER_SHAPE });
       
        // Movement
        let ax = 0, ay = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
        if (keys['KeyW'] || keys['ArrowUp']) ay -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) ay += 1;
        
        const moveSpeed = player.stats.moveSpeed;
        const diagFactor = (ax !== 0 && ay !== 0) ? 0.707 : 1;
        player.vx = ax * moveSpeed * diagFactor;
        player.vy = ay * moveSpeed * diagFactor * 0.6; // Depth movement is slower

        if (Math.abs(player.vx) > 1) player.direction = player.vx > 0 ? 1 : -1;

        // Jump
        if (keys['Space'] && player.onGround) {
            player.vz = player.stats.jumpVelocity;
            player.onGround = false;
        }

        // Physics for all entities
        const allMovableEntities: Entity[] = [player, ...enemies, ...(boss ? [boss] : [])];
        allMovableEntities.forEach(e => {
            // Z-axis (height) physics
            e.vz += e.stats.gravity * dt;
            e.z += e.vz * dt;
            if (e.z <= 0) {
                e.z = 0;
                e.vz = 0;
                e.onGround = true;
            } else {
                e.onGround = false;
            }

            // Knockback friction/decay
            e.knockbackVx *= (1 - 5 * dt);
            e.knockbackVy *= (1 - 5 * dt);
            if (Math.abs(e.knockbackVx) < 1) e.knockbackVx = 0;
            if (Math.abs(e.knockbackVy) < 1) e.knockbackVy = 0;

            // X and Y axis (ground plane) physics
            e.x += (e.vx + e.knockbackVx) * dt;
            e.y += (e.vy + e.knockbackVy) * dt;
            e.x = clamp(e.x, 0, GAME_WIDTH - e.width);
            e.y = clamp(e.y, PLAY_AREA_Y_MIN, PLAY_AREA_Y_MAX - e.height);
        });

        // Attacks
        const atkA = composeAttack(player.baseAttackA, inventory.socketA);
        const atkB = composeAttack(player.baseAttackB, inventory.socketB);

        if (!player.attackState && (keys['KeyJ'] || keys['KeyZ']) && now - player.lastAttackA >= atkA.baseCooldown * 1000) {
            player.lastAttackA = now;
            player.attackState = { spec: atkA, startedAt: now };
            attackInstances.push({ id: nextId(), ownerId: player.id, spec: atkA, x: player.x + player.width/2, y: player.y + player.height/2, z: player.z + player.height / 2, direction: player.direction, expiresAt: now + atkA.active * 1000, hitEnemyIds: new Set(), socketSource: 'A' });
        }
        if (!player.attackState && (keys['KeyK'] || keys['KeyX']) && now - player.lastAttackB >= atkB.baseCooldown * 1000) {
            player.lastAttackB = now;
            player.attackState = { spec: atkB, startedAt: now };
            const lineX = player.direction > 0 ? player.x + player.width : player.x;
            attackInstances.push({ id: nextId(), ownerId: player.id, spec: atkB, x: lineX, y: player.y + player.height/2, z: player.z + player.height / 2, direction: player.direction, expiresAt: now + atkB.active * 1000, hitEnemyIds: new Set(), socketSource: 'B' });
            if (atkB.projectile) {
                const p = atkB.projectile;
                const px = player.x + player.width / 2 + (player.direction * (player.width / 2 + 4));
                const py = player.y + player.height / 2 - 6;
                const pz = player.z + player.height / 2;
                projectiles.push({ id: nextId(), x: px, y: py, z: pz, width: p.width, height: p.height, vx: p.speed * player.direction, vz: 0, damage: atkB.baseDamage * 0.7, ownerId: player.id, expiresAt: now + p.lifetime * 1000 });
            }
        }
        
        // Update & check collisions for attack instances
        attackInstances = attackInstances.filter(attack => {
            if (now > attack.expiresAt) return false;
            const attackCards = attack.socketSource === 'A' ? inventory.socketA : inventory.socketB;
            const attackTags = getTagsFromCards(attackCards);

            enemies.forEach(e => {
                if (e.stats.hp <= 0 || attack.hitEnemyIds.has(e.id)) return;
                
                const zDist = Math.abs((e.z + e.height / 2) - attack.z);
                if (zDist > 30) return; // Height check for attack

                let hit = false;
                if (attack.spec.shape === 'circle') {
                    const distSq = (e.x + e.width/2 - attack.x)**2 + (e.y + e.height/2 - attack.y)**2;
                    if (distSq < (attack.spec.area + e.width/2)**2) hit = true;
                } else if (attack.spec.shape === 'line') {
                    const lineLeft = attack.direction > 0 ? attack.x : attack.x - attack.spec.area;
                    const lineRect = {x: lineLeft, y: attack.y - 20, width: attack.spec.area, height: 40};
                    if (e.x < lineRect.x + lineRect.width && e.x + e.width > lineRect.x && e.y < lineRect.y + lineRect.height && e.y + e.height > lineRect.y) hit = true;
                }

                if (hit) {
                    attack.hitEnemyIds.add(e.id);
                    e.stats.hp -= attack.spec.baseDamage;
                    const knockbackAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    e.knockbackVx += Math.cos(knockbackAngle) * attack.spec.knockback;
                    e.knockbackVy += Math.sin(knockbackAngle) * attack.spec.knockback;

                    if (attackTags.has('poison')) {
                        e.statusEffects = e.statusEffects.filter(ef => ef.kind !== 'poison');
                        e.statusEffects.push({ kind: 'poison', remaining: 3.0, dps: 3 });
                    }
                    if (attackTags.has('slow')) {
                        e.statusEffects = e.statusEffects.filter(ef => ef.kind !== 'slow');
                        e.statusEffects.push({ kind: 'slow', remaining: 1.5, slowFactor: 0.6 });
                    }
                }
            });
            return true;
        });

        // Projectiles
        projectiles = projectiles.filter(p => {
            p.x += p.vx * dt;
            p.vz += GRAVITY * dt;
            p.z += p.vz * dt;
            if (p.z < 0) p.z = 0;

            if (now > p.expiresAt) return false;
            
            const hitEnemy = enemies.find(e => e.stats.hp > 0 && Math.abs(e.z - p.z) < e.height && p.x < e.x + e.width && p.x + p.width > e.x && p.y < e.y + e.height && p.y + p.height > e.y);
            if(hitEnemy && p.ownerId === player.id) {
                hitEnemy.stats.hp -= p.damage;
                return false;
            }
            if(p.ownerId !== player.id && Math.abs(player.z - p.z) < player.height && p.x < player.x + player.width && p.x + p.width > player.x && p.y < player.y + player.height && p.y + p.height > player.y){
                player.stats.hp -= p.damage;
                return false;
            }
            return true;
        });
        
        // Enemy AI & Status Effects
        [...enemies, ...(boss ? [boss] : [])].forEach(e => {
            if (e.stats.hp <= 0) return;

            let speedFactor = 1.0;
            e.statusEffects = e.statusEffects.filter(effect => {
                effect.remaining -= dt;
                if (effect.remaining <= 0) return false;
                if (effect.kind === 'poison') e.stats.hp -= (effect.dps || 2) * dt;
                if (effect.kind === 'slow') speedFactor = Math.min(speedFactor, effect.slowFactor || 0.6);
                return true;
            });

            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const moveSpeed = e.stats.moveSpeed * speedFactor;

            if (!e.isBoss) {
                 const spec = ENEMY_SPECS[e.enemyType];
                 let targetDist = 25;
                 let shouldRetreat = false;

                 if (e.enemyType === 'scout') {
                     targetDist = 120;
                     if (dist < targetDist - 20) {
                         shouldRetreat = true;
                     }
                 }

                 if (shouldRetreat) {
                     e.vx = -(dx / dist) * moveSpeed;
                     e.vy = -(dy / dist) * moveSpeed * 0.6;
                 } else if (dist > targetDist) {
                     e.vx = (dx / dist) * moveSpeed;
                     e.vy = (dy / dist) * moveSpeed * 0.6;
                 } else {
                     e.vx = 0;
                     e.vy = 0;
                 }

                 if (dist < (e.enemyType === 'brute' ? 45 : 40) && Math.abs(player.z - e.z) < 30 && now - (e.lastHit || 0) > (e.enemyType === 'brute' ? 1100 : 700)) {
                     e.lastHit = now;
                     player.stats.hp -= spec.damage;
                     const knockbackAngle = Math.atan2(player.y - e.y, player.x - e.x);
                     player.knockbackVx += Math.cos(knockbackAngle) * spec.knockback * 2.5;
                     player.knockbackVy += Math.sin(knockbackAngle) * spec.knockback * 2.5;
                 }
            } else { // Boss logic
                if(dist > 80) {
                    e.vx = (dx / dist) * moveSpeed;
                    e.vy = (dy / dist) * moveSpeed * 0.6;
                } else {
                    e.vx = 0;
                    e.vy = 0;
                }
                if (now - (e.lastShot || 0) > (e.shootCooldown || 1200)) {
                    e.lastShot = now;
                    projectiles.push({ id: nextId(), x: e.x + e.width/2, y: e.y + e.height/2, z: e.z + e.height / 2, width: 8, height: 4, vx: 280 * Math.sign(dx), vz: 50, damage: 8, ownerId: e.id, expiresAt: now + 1200 });
                }
            }
        });

        // Clean up dead
        const deadEnemies = enemies.filter(e => e.stats.hp <= 0);
        const allPlayerTags = getTagsFromCards(allSocketCards);
        deadEnemies.forEach(e => {
            const spec = ENEMY_SPECS[e.enemyType];
            player.xp += spec.xpValue;

            if (Math.random() < 0.55) pickups.push(spawnPickup(e.x, e.y));
            if(allPlayerTags.has('nova')) {
                const novaSpec: AttackSpec = { name: "Viral Nova", baseDamage: 5, baseCooldown: 0, shape: 'circle', area: 80, hitstun: 0.1, knockback: 50, startup: 0, active: 0.2, recovery: 0 };
                attackInstances.push({ id: nextId(), ownerId: player.id, spec: novaSpec, x: e.x + e.width / 2, y: e.y + e.height / 2, z: e.z + e.height/2, direction: 1, expiresAt: now + novaSpec.active * 1000, hitEnemyIds: new Set(), socketSource: 'A' });
            }
        });
        enemies = enemies.filter(e => e.stats.hp > 0);
        
        if (boss && boss.stats.hp <= 0) {
            player.xp += 100; // Boss XP
            pickups.push({ id: nextId(), x: boss.x, y: boss.y, z: 0, width: 18, height: 18, card: mut_sidearm(2) });
            boss = null;
        }
        
        // Level up check
        if (player.xp >= player.xpToNextLevel) {
            const choices = generateLevelUpChoices();
            dispatch({ type: 'LEVEL_UP_START', payload: { choices } });
            // The game loop will be paused by the useEffect hook, no need to cancel animation frame here
        }

        // Wave management
        if (enemies.length === 0 && !boss) {
            wave++;
            if (wave % 5 === 0) {
                boss = spawnBoss();
            } else {
                enemies = Array.from({ length: 3 + wave }, () => spawnEnemy(wave));
            }
        }
        
        // Pickups
        pickups = pickups.filter(p => {
            if (player.z < 20 && Math.abs(player.x - p.x) < 20 && Math.abs(player.y - p.y) < 20) {
                inventory = addCardToInventory(inventory, p.card);
                return false;
            }
            return true;
        });

        let gameOver = state.gameOver;
        if (player.stats.hp <= 0) {
            gameOver = true;
        }

        dispatch({ type: 'TICK', payload: { player, enemies, projectiles, pickups, attackInstances, inventory, wave, boss, gameOver } });
        
        if (!gameOver) {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
        }

    }, [state, keys, generateLevelUpChoices]);

    useEffect(() => {
        if (!state.gameOver && !showInstructions && !state.isLevelUpScreenActive) {
            lastTime.current = performance.now();
            gameLoopRef.current = requestAnimationFrame(gameLoop);
        }
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameLoop, state.gameOver, showInstructions, state.isLevelUpScreenActive]);



    if (state.gameOver) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-800">
                <h1 className="text-6xl font-bold text-red-500 mb-4">GAME OVER</h1>
                <p className="text-xl mb-6">You reached wave {state.wave}</p>
                <button
                    onClick={() => dispatch({ type: 'RESTART' })}
                    className="px-6 py-3 bg-green-500 text-white font-bold rounded-lg shadow-lg hover:bg-green-600 transition-colors">
                    Restart
                </button>
            </div>
        );
    }

    const { enemies, projectiles, pickups, attackInstances, wave, boss } = state;
    const allEntities = [
        ...enemies.map(e => ({...e, type: 'enemy'})),
        ...(boss ? [{...boss, type: 'enemy'}] : []),
        ...projectiles.map(p => ({...p, type: 'projectile'})),
        ...pickups.map(p => ({...p, type: 'pickup'})),
        {...player, type: 'player'}
    ].sort((a,b) => (a.y + a.height) - (b.y + b.height));


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
            <div className="relative bg-gray-900 overflow-hidden" style={{ width: GAME_WIDTH, height: GAME_HEIGHT, perspective: '1200px' }}>
                {showInstructions && <InstructionsModal onClose={() => setShowInstructions(false)} />}
                {state.isLevelUpScreenActive && <LevelUpModal choices={state.levelUpChoices} onSelect={(choice) => dispatch({ type: 'LEVEL_UP_SELECT', payload: { choice } })} />}
                
                <div className="absolute inset-0 preserve-3d" style={{ transform: 'rotateX(50deg) rotateZ(-45deg) scale(0.9)', top: -100 }}>
                    {/* Floor */}
                    <div
                        className="absolute bg-gray-800"
                        style={{
                            width: GAME_WIDTH * 1.5,
                            height: GAME_WIDTH * 1.5,
                            left: '50%',
                            top: '50%',
                            transform: `translate(-50%, -50%) translateZ(-100px)`,
                            backgroundImage: `
                                repeating-linear-gradient(45deg, #4a5568, #4a5568 1px, transparent 1px, transparent 40px),
                                repeating-linear-gradient(-45deg, #4a5568, #4a5568 1px, transparent 1px, transparent 40px)
                            `
                        }}
                    />

                    {/* Entities - sorted by Y for correct overlap */}
                    {allEntities.map(e => {
                        switch(e.type) {
                            case 'player': return <PlayerComponent key={e.id} entity={e as Player} />;
                            case 'enemy': return <EnemyComponent key={e.id} entity={e as Enemy} />;
                            case 'projectile': return <ProjectileComponent key={e.id} p={e as Projectile} />;
                            case 'pickup': return <PickupComponent key={e.id} p={e as Pickup} />;
                            default: return null;
                        }
                    })}
                    {attackInstances.map(a => <AttackEffect key={a.id} attack={a} />)}
                </div>
            </div>

            {/* HUD */}
            <div className="w-full max-w-4xl mt-2 p-2 bg-gray-900/80 rounded-lg text-sm font-mono flex flex-col items-center space-y-2">
                <div className="w-full flex justify-between items-center space-x-4">
                    <div className="flex-shrink-0">
                        <p>HP: {Math.ceil(player.stats.hp)}/{player.stats.maxHp}</p>
                        <p>Wave: {wave}</p>
                    </div>
                    <div className="flex-grow text-center">
                        <p>Backpack: <span className="text-gray-400">{inventory.backpack.map(c => `${c.id}(${c.level})`).join(', ') || 'Empty'}</span></p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                        <p>Attack A: <span className="text-lime-400 font-bold">{inventory.socketA.map(c => `${c.id}(${c.level})`).join(', ') || 'None'}</span></p>
                        <p>Attack B: <span className="text-sky-400 font-bold">{inventory.socketB.map(c => `${c.id}(${c.level})`).join(', ') || 'None'}</span></p>
                    </div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${(player.xp / player.xpToNextLevel) * 100}%` }}></div>
                    <div className="text-center text-xs -mt-3 text-white font-bold">LVL {player.level}</div>
                </div>
            </div>
        </div>
    );
}
