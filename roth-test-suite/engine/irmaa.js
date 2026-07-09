import { TT } from './taxTables.js';
import { inflF } from './taxEngine.js';

export function irmaaThreshAt(i, status, year, infl){
  let v = TT.irmaa.thresholds[status][i];
  if(i < 4) v *= inflF(year, infl);
  else if(year >= TT.irmaa.topTierIndexFrom) v *= Math.pow(1+infl, year - TT.irmaa.topTierIndexFrom);
  return v;
}
export function irmaaTier(magi, status, year, infl){
  let tier = -1;
  for(let i=0;i<TT.irmaa.thresholds[status].length;i++)
    if(magi > irmaaThreshAt(i, status, year, infl)) tier = i;
  return tier; // -1 = no surcharge
}
export function irmaaAnnualPerPerson(tier, year, infl){
  if(tier < 0) return 0;
  return 12*(TT.irmaa.surchB[tier]+TT.irmaa.surchD[tier])*inflF(year, infl);
}
