
import type { AttackSpec, MutationCard } from '../types';

export const composeAttack = (base: AttackSpec, cards: MutationCard[]): AttackSpec => {
    return cards.reduce((acc, card) => card.applyToAttack(acc, card.level), base);
};
