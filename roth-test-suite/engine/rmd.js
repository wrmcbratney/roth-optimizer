import { TT } from './taxTables.js';

export const rmdAge = by => (by <= 1959 ? 73 : 75);
export const ultAt  = age => TT.ult[Math.min(Math.max(age,72),120)];
