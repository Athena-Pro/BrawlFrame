
import type { MutationCard, AttackSpec, Shape, Stats } from '../types';
import { TINT_CLASSES } from '../constants';
import { scaleLinear, softArea, clamp } from '../utils';

// A deep copy utility for specs to avoid mutation. Using structuredClone preserves
// complex data types like Sets or Maps that JSON serialization would drop. A
// runtime assertion checks that these types survive cloning.
const cloneSpec = <T,>(spec: T): T => {
    const cloned = structuredClone(spec);
    if (typeof spec === 'object' && spec !== null) {
        for (const [key, value] of Object.entries(spec as Record<string, unknown>)) {
            const clonedValue = (cloned as Record<string, unknown>)[key];
            if (value instanceof Set) {
                console.assert(clonedValue instanceof Set, `cloneSpec: field "${key}" expected to be a Set`);
            } else if (value instanceof Map) {
                console.assert(clonedValue instanceof Map, `cloneSpec: field "${key}" expected to be a Map`);
            } else if (value instanceof Date) {
                console.assert(
                    clonedValue instanceof Date && +clonedValue === +value,
                    `cloneSpec: field "${key}" expected to be a Date`
                );
            }
        }
    }
    return cloned;
};

export const mut_poison = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.baseDamage = scaleLinear(a.baseDamage, L, 0.15) * 0.9;
        newSpec.baseCooldown = a.baseCooldown * 1.05;
        newSpec.name = a.name + " +Poison";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.POISON });
    return { id: "poison", level, tags: new Set(["poison"]), applyToAttack, applyToShape };
};

export const mut_longreach = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.area = softArea(a.area, L);
        newSpec.name = a.name + " +Reach";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.LONGREACH });
    return { id: "long_reach", level, tags: new Set(["range+"]), applyToAttack, applyToShape };
};

export const mut_knockback = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.knockback = a.knockback * (1 + 0.3 * L);
        newSpec.name = a.name + " +KB";
        return newSpec;
    };
     const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.KNOCKBACK });
    return { id: "knockback", level, tags: new Set(["control"]), applyToAttack, applyToShape };
};

export const mut_twinstrike = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.baseDamage = a.baseDamage * 0.85;
        newSpec.baseCooldown = Math.max(0.18, a.baseCooldown * (0.8 - 0.05 * L));
        newSpec.recovery = Math.max(0.06, a.recovery * (0.85 - 0.03 * L));
        newSpec.name = a.name + " +Twin";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.TWINSTRIKE });
    return { id: "twin", level, tags: new Set(["multihit"]), applyToAttack, applyToShape };
};

export const mut_sidearm = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.projectile = { speed: 400 + 40 * L, lifetime: 0.6 + 0.06 * L, width: 8, height: 4, pierce: 0 };
        newSpec.baseCooldown = a.baseCooldown * 1.1; // small tax
        newSpec.name = a.name + " +Sidearm";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.SIDEARM });
    return { id: "sidearm", level, tags: new Set(["ranged"]), applyToAttack, applyToShape };
};


export const mut_cryo = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.name = a.name + " +Cryo";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.CRYO });
    return { id: "cryo", level, tags: new Set(["slow"]), applyToAttack, applyToShape };
};

export const mut_elastic = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.area = softArea(a.area, L * 1.5);
        newSpec.baseDamage = a.baseDamage * (1 - 0.1 * L);
        newSpec.recovery = a.recovery * (1 + 0.15 * L);
        newSpec.name = a.name + " +Elastic";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({
        ...s,
        scale: s.scale * (1 + 0.1 * L),
        tintClass: TINT_CLASSES.ELASTIC,
    });
    return { id: "elastic", level, tags: new Set(["area"]), applyToAttack, applyToShape };
};

export const mut_viral = (level: number): MutationCard => {
    const applyToAttack = (a: AttackSpec, L: number): AttackSpec => {
        const newSpec = cloneSpec(a);
        newSpec.name = a.name + " +Viral";
        return newSpec;
    };
    const applyToShape = (s: Shape, L: number): Shape => ({ ...s, tintClass: TINT_CLASSES.VIRAL });
    return { id: "viral", level, tags: new Set(["poison", "nova"]), applyToAttack, applyToShape };
};

export const ALL_MUTATIONS = [mut_poison, mut_longreach, mut_knockback, mut_twinstrike, mut_cryo, mut_elastic, mut_viral];
