import { TT } from './taxTables.js';

export function inflF(year, infl){ return Math.pow(1+infl, year - TT.BASE_YEAR); }

export function bracketTax(amount, table, f){
  let tax = 0;
  for(let i=0;i<table.length;i++){
    const lo = table[i][0]*f, rate = table[i][1];
    const hi = (i+1<table.length ? table[i+1][0]*f : Infinity);
    if(amount > lo) tax += (Math.min(amount,hi)-lo)*rate; else break;
  }
  return tax;
}
export function ltcgTax(ordTI, qdi, status, f){
  const tbl = TT.ltcg[status]; let tax = 0;
  for(let i=0;i<tbl.length;i++){
    const lo = tbl[i][0]*f, rate = tbl[i][1];
    const hi = (i+1<tbl.length ? tbl[i+1][0]*f : Infinity);
    const from = Math.max(ordTI, lo), to = Math.min(ordTI+qdi, hi);
    if(to > from) tax += (to-from)*rate;
  }
  return tax;
}
// One household-year tax computation.
// inp: {year, status, n65, ss, ordinary, qdi, infl, stateRate}
export function computeYear(inp){
  const f = inflF(inp.year, inp.infl), st = inp.status;
  const tei = inp.taxExemptInterest || 0;   // muni interest: in provisional income & MAGI, not AGI
  // --- taxable Social Security (provisional income; thresholds frozen) ---
  const [t1,t2] = TT.ssThresh[st];
  const pi = inp.ordinary + inp.qdi + tei + .5*inp.ss;
  let taxSS = 0;
  if(inp.ss > 0 && pi > t1){
    taxSS = (pi <= t2)
      ? Math.min(.5*(pi-t1), .5*inp.ss)
      : Math.min(.85*(pi-t2) + Math.min(.5*(t2-t1), .5*inp.ss), .85*inp.ss);
  }
  const agi  = inp.ordinary + inp.qdi + taxSS;
  const magi = agi + tei;   // MAGI adds back tax-exempt interest (IRMAA/NIIT basis)
  // --- deductions ---
  let ded = TT.stdDed[st]*f + inp.n65*TT.addl65[st]*f;
  if(inp.year <= TT.seniorBonus.lastYear && inp.n65 > 0){
    ded += Math.max(0, TT.seniorBonus.amt*inp.n65
                    - TT.seniorBonus.rate*Math.max(0, magi - TT.seniorBonus.threshold[st]));
  }
  const ti    = Math.max(0, agi - ded);
  const ordTI = Math.max(0, ti - inp.qdi);
  const qdiT  = ti - ordTI;
  const fed   = bracketTax(ordTI, TT.ordinary[st], f) + ltcgTax(ordTI, qdiT, st, f);
  const niit  = TT.niit.rate * Math.min(inp.qdi, Math.max(0, magi - TT.niit.threshold[st]));
  const state = inp.stateRate * ti;
  return { taxSS, agi, magi, ti, fed, niit, state, tax: fed+niit+state };
}
export function ordRateAt(ordTI, status, year, infl){
  const f = inflF(year, infl); let r = TT.ordinary[status][0][1];
  for(const b of TT.ordinary[status]) if(ordTI > b[0]*f) r = b[1];
  return r;
}
