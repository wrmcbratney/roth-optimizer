import { TT } from './taxTables.js';
import { inflF } from './taxEngine.js';
import { irmaaThreshAt } from './irmaa.js';
import { rmdAge } from './rmd.js';
import { simulate } from './simulation.js';

export const TARGETS = [
  {id:'none', label:'No conversions',        kind:'none'},
  {id:'b12',  label:'Fill 12% bracket',      kind:'ti',   fn:(y,s,i)=>TT.ordinary[s][2][0]*inflF(y,i)},
  {id:'b22',  label:'Fill 22% bracket',      kind:'ti',   fn:(y,s,i)=>TT.ordinary[s][3][0]*inflF(y,i)},
  {id:'b24',  label:'Fill 24% bracket',      kind:'ti',   fn:(y,s,i)=>TT.ordinary[s][4][0]*inflF(y,i)},
  {id:'b32',  label:'Fill 32% bracket',      kind:'ti',   fn:(y,s,i)=>TT.ordinary[s][5][0]*inflF(y,i)},
  {id:'i1',   label:'Stay under IRMAA tier 1', kind:'magi', fn:(y,s,i)=>irmaaThreshAt(0,s,y,i)-1},
  {id:'i2',   label:'Fill to IRMAA tier 2',  kind:'magi', fn:(y,s,i)=>irmaaThreshAt(1,s,y,i)-1},
  {id:'i3',   label:'Fill to IRMAA tier 3',  kind:'magi', fn:(y,s,i)=>irmaaThreshAt(2,s,y,i)-1},
  {id:'i4',   label:'Fill to IRMAA tier 4',  kind:'magi', fn:(y,s,i)=>irmaaThreshAt(3,s,y,i)-1},
  {id:'i5',   label:'Fill to IRMAA tier 5 (top)', kind:'magi', fn:(y,s,i)=>irmaaThreshAt(4,s,y,i)-1},
  {id:'niit', label:'Stay under NIIT',       kind:'magi', fn:(y,s,i)=>TT.niit.threshold[s]}
];
export const targetById = id => TARGETS.find(t=>t.id===id);

// policy: {name, perYear:{year: {id} | {kind:'amt',amt}}}
export function constPolicy(name, id, s, e){
  const perYear = {}; for(let y=s;y<=e;y++) perYear[y]={id};
  return {name, perYear};
}
export function amtPolicy(name, amt, s, e){
  const perYear = {}; for(let y=s;y<=e;y++) perYear[y]={kind:'amt', amt};
  return {name, perYear};
}

export function levelEmptyBy(M, targetYear, s, e, label){
  // smallest level annual conversion over [s,e] that empties pre-tax by start of targetYear
  const tot0 = M.spouses.reduce((a,x)=>a+x.trad,0);
  let lo=0, hi=tot0*1.5, best=null;
  const tradAt = A => {
    const sim = simulate(M, amtPolicy('', A, s, Math.min(e, targetYear-1)));
    const row = sim.rows.find(r=>r.y===targetYear-1) || sim.rows[sim.rows.length-1];
    return row ? row.trad : 0;
  };
  for(let i=0;i<28;i++){ const mid=(lo+hi)/2; if(tradAt(mid) > tot0*0.001) lo=mid; else {hi=mid; best=mid;} }
  return amtPolicy(label, best||hi, s, Math.min(e, targetYear-1));
}
/* ================= STRATEGY SEARCH & SENSITIVITY ================= */
const OBJECTIVES = {
  termWealth:{ label:'Maximize terminal after-tax wealth', f:s=>s.terminal.nom },  // PV ranking is identical (same end year)
  minTaxPV:  { label:"Minimize lifetime client tax (today's $, ignores heirs)", f:s=>-(s.tax.pv+s.irm.pv) },
  minTotalPV:{ label:"Minimize total tax incl. heirs (today's $)", f:s=>-s.total.pv }
};
export function condensePlan(policy, M){
  const parts=[]; let run=null;
  for(let y=M.convStart;y<=M.convEnd;y++){
    const t = policy.perYear[y];
    const id = t ? (t.kind==='amt' ? 'amt'+Math.round(t.amt) : t.id) : 'none';
    const lbl = t ? (t.kind==='amt' ? '$'+Math.round(t.amt).toLocaleString()+'/yr' : targetById(t.id).label) : 'No conversion';
    if(run && run.id===id) run.e=y;
    else { if(run) parts.push(run); run={id,lbl,s:y,e:y}; }
  }
  if(run) parts.push(run);
  return parts.filter(p=>p.id!=='none')
              .map(p=> (p.s===p.e? p.s : p.s+'\u2013'+p.e)+': '+p.lbl).join(' \u00b7 ') || 'No conversions';
}
export function dominantId(policy){
  const c={}; Object.values(policy.perYear).forEach(t=>{ const id=t.id||'amt'; c[id]=(c[id]||0)+1; });
  let best=null; Object.entries(c).forEach(([id,n])=>{ if(!best || n>c[best]) best=id; });
  return best;
}
// Level conversions sized so the FIRST RMD year's taxable income lands at (not above) the chosen bracket top.
// Anchored to the first RMD year only — later RMDs drift upward as the IRS divisor shrinks (disclosed).
export function preserveBracket(M, topIdx, label){
  const Y0 = Math.min(...M.spouses.map(sp=> sp.by + rmdAge(sp.by)));
  if(Y0 <= M.convStart + 1) return null;
  const e = Math.min(M.convEnd, Y0 - 1);
  const tiAt = A => {
    const sim = simulate(M, amtPolicy(label, A, M.convStart, e));
    const row = sim.rows.find(r=>r.y===Y0);
    return row ? {ti:row.ti, status:row.status} : {ti:0, status:'mfj'};
  };
  const probe = tiAt(0);
  const target = TT.ordinary[probe.status][topIdx][0] * inflF(Y0, M.infl);
  if(probe.ti <= target) return null;                       // baseline RMDs already fit the bracket
  const tot0 = M.spouses.reduce((a,x)=>a+x.trad,0);
  let lo=0, hi=tot0*1.5;
  for(let i=0;i<26;i++){ const mid=(lo+hi)/2; (tiAt(mid).ti > target) ? lo=mid : hi=mid; }
  return simulate(M, amtPolicy(label, hi, M.convStart, e));
}
