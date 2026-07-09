import { TT } from './taxTables.js';

export function validate(M){
  const errors=[], warns=[], nowY=TT.BASE_YEAR;
  M.spouses.forEach(s=>{
    const age = nowY - s.by;
    if(s.by < 1920 || s.by > 2010) errors.push(s.name+': birth year '+s.by+' out of range.');
    if(s.deathAge!=null && s.deathAge < age) errors.push(s.name+': modeled death age '+s.deathAge+' is below current age '+age+'.');
    if(s.deathAge!=null && s.deathAge > 120) errors.push(s.name+': death age above 120.');
    if(s.ssAge < 62 || s.ssAge > 70) errors.push(s.name+': SS claiming age must be 62–70.');
    if(s.trad < 0 || s.ss < 0 || s.pen < 0 || s.oth < 0) errors.push(s.name+': negative dollar input.');
  });
  const oldest = Math.max(...M.spouses.map(s=>nowY - s.by));
  if(M.endAge <= oldest) errors.push('Projection end age must exceed the oldest current age ('+oldest+').');
  if(M.endAge > 105) warns.push('Projection end age above 105.');
  if(M.roth < 0 || M.taxable < 0) errors.push('Negative account balance.');
  if(M.convEnd < M.convStart) errors.push('Conversion window end precedes start.');
  if(M.convStart < M.startYear) errors.push('Conversion window starts before '+M.startYear+'.');
  if(M.yTax > M.gTax + 1e-9) warns.push('Taxable yield exceeds taxable total return — dividends will outpace growth.');
  // rate ranges (entered as %): hard errors for nonsense, warnings for unusual stress-test values
  const pct = [['gTrad',M.gTrad,'Trad growth'],['gRoth',M.gRoth,'Roth growth'],['gTax',M.gTax,'Taxable growth'],
               ['yTax',M.yTax,'Taxable yield'],['infl',M.infl,'Inflation'],['cola',M.cola,'SS COLA'],
               ['stateRate',M.stateRate,'State tax'],['heir',M.heir,'Heir rate'],['disc',M.disc,'Discount rate'],
               ['penSurv',M.penSurv,'Pension survivor %']];
  pct.forEach(([k,v,lbl])=>{ if(v > 1 || v < -0.5) errors.push(lbl+' of '+(v*100).toFixed(0)+'% is outside allowed bounds.'); });
  if(M.heir < 0 || M.heir > 0.6) errors.push('Heir marginal rate must be 0–60%.');
  if(M.penSurv < 0 || M.penSurv > 1) errors.push('Pension survivor % must be 0–100%.');
  if(M.stateRate < 0 || M.stateRate > 0.15) errors.push('State tax must be 0–15%.');
  [['Trad growth',M.gTrad],['Roth growth',M.gRoth],['Taxable growth',M.gTax]].forEach(([l,v])=>{
    if(v < 0) warns.push(l+' is negative (stress test?).'); else if(v > 0.12) warns.push(l+' above 12% is aggressive.'); });
  if(M.yTax < 0 || M.yTax > 0.08) warns.push('Taxable yield outside 0–8% is unusual.');
  if(M.infl < 0) warns.push('Negative inflation (deflation stress test?).'); else if(M.infl > 0.08) warns.push('Inflation above 8% is unusual.');
  if(M.cola < 0 || M.cola > 0.08) warns.push('SS COLA outside 0–8% is unusual.');
  if(M.disc < 0) warns.push('Negative discount rate.'); else if(M.disc > 0.10) warns.push('Discount rate above 10% is unusual.');
  return {errors, warns};
}
