
export const scaleLinear = (base: number, level: number, per: number = 0.25): number => {
    return base * (1 + per * level);
};

export const softArea = (area: number, level: number): number => {
    return area * (1 + 0.5 * Math.tanh(0.5 * level));
};

export const clamp = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
};

export const getScaleClass = (scale: number): string => {
    const roundedScale = Math.round(clamp(scale, 0.5, 2.0) * 20) * 5;
    const validScales = [50, 75, 90, 95, 100, 105, 110, 125, 150];
    const closest = validScales.reduce((prev, curr) => 
        (Math.abs(curr - roundedScale) < Math.abs(prev - roundedScale) ? curr : prev)
    );
    return `scale-${closest}`;
};
