import { TT } from './taxTables.js';
import { inflF } from './taxEngine.js';
import { irmaaThreshAt } from './irmaa.js';
import { simulate } from './simulation.js';
import { rmdAge } from './rmd.js';
import { constPolicy, amtPolicy, targetById, TARGETS, levelEmptyBy, condensePlan, dominantId, preserveBracket } from './strategies.js';

export const OBJECTIVES = {
  termWealth:{ label:'Maximize terminal after-tax wealth', f:s=>s.terminal.nom },  // PV ranking is identical (same end year)
  minTaxPV:  { label:"Minimize lifetime client tax (today's $, ignores heirs)", f:s=>-(s.tax.pv+s.irm.pv) },
  minTotalPV:{ label:"Minimize total tax incl. heirs (today's $)", f:s=>-s.total.pv }
};

export function optimize(M){
  const objF = (OBJECTIVES[M.objective]||OBJECTIVES.termWealth).f;
  const score = s => (s.failed && !M.allowForcedDraws) ? -1e18 : objF(s);
  const s0=M.convStart, e0=Math.min(M.convEnd, M.startYear + 60);
  const span=e0-s0, step = span>16?2:1;
  const strategies = [];
  const baseline = simulate(M, {name:'No conversions (baseline)', perYear:{}});
  strategies.push(baseline);

  TARGETS.filter(t=>t.id!=='none').forEach(t=>{
    strategies.push(simulate(M, constPolicy(t.label+' ('+s0+'\u2013'+e0+')', t.id, s0, e0)));
  });
  if(M.fixedAmt>0) strategies.push(simulate(M, amtPolicy('Fixed $'+Math.round(M.fixedAmt).toLocaleString()+'/yr', M.fixedAmt, s0, e0)));

  const firstRMD = Math.min(...M.spouses.map(sp=> sp.by + rmdAge(sp.by)));
  if(firstRMD > s0+1) strategies.push(simulate(M, levelEmptyBy(M, firstRMD, s0, e0, 'Empty pre-tax before RMDs ('+firstRMD+')')));
  const firstDeath = Math.min(...M.spouses.filter(sp=>sp.deathAge!=null).map(sp=>sp.by+sp.deathAge+1), Infinity);
  if(isFinite(firstDeath) && firstDeath > s0+1) strategies.push(simulate(M, levelEmptyBy(M, firstDeath, s0, e0, 'Empty pre-tax before first death ('+firstDeath+')')));
  const p12 = preserveBracket(M, 2, 'Preserve 12% RMD capacity'); if(p12) strategies.push(p12);
  const p22 = preserveBracket(M, 3, 'Preserve 22% RMD capacity'); if(p22) strategies.push(p22);

  let best = null;
  TARGETS.filter(t=>t.id!=='none').forEach(t=>{
    for(let s=s0;s<=e0;s+=step) for(let e=s;e<=e0;e+=step){
      const sim = simulate(M, constPolicy(t.label+' ('+s+'\u2013'+e+')', t.id, s, e));
      if(!best || score(sim) > score(best)) best = sim;
    }
  });

  let seed = best;
  strategies.forEach(s=>{ if(score(s) > score(seed)) seed = s; });
  let refined = simulate(M, { name:'Best modeled strategy (year-by-year)', perYear:{...seed.policy.perYear} });
  for(let pass=0; pass<4; pass++){
    let improved=false;
    for(let y=s0;y<=e0;y++){
      for(const t of TARGETS){
        const cur = refined.policy.perYear[y];
        if(cur && cur.id===t.id) continue;
        const trial = {name:refined.policy.name, perYear:{...refined.policy.perYear}};
        if(t.id==='none') delete trial.perYear[y]; else trial.perYear[y]={id:t.id};
        const sim = simulate(M, trial);
        if(score(sim) > score(refined) + 1){ refined = sim; improved=true; }
      }
    }
    if(!improved) break;
  }
  refined.policy.name = 'Best modeled strategy (year-by-year)';
  refined.isWinner = true;
  best.policy.name = 'Best single target: '+best.policy.name;
  strategies.push(best, refined);

  strategies.forEach(st=>{
    st.breakEven = null;
    if(st===baseline) return;
    for(const r of st.rows){
      const b = baseline.rows.find(x=>x.y===r.y);
      if(b && r.wealth >= b.wealth && r.y > M.startYear){ st.breakEven = r.y; break; }
    }
    st.savings = { nom: baseline.total.nom - st.total.nom, pv: baseline.total.pv - st.total.pv };
    st.dTerm   = { nom: st.terminal.nom - baseline.terminal.nom, pv: st.terminal.pv - baseline.terminal.pv };
  });
  baseline.savings={nom:0,pv:0}; baseline.dTerm={nom:0,pv:0};

  // ---- sensitivity: growth +/-1% band on the winner, and the drag-flip check ----
  let sensitivity = null;
  if(!M._noSens){
    const band = d => {
      const M2 = {...M, gTrad:M.gTrad+d, gRoth:M.gRoth+d, gTax:M.gTax+d, _noSens:true};
      return simulate(M2, refined.policy).terminal.pv - simulate(M2, {name:'b',perYear:{}}).terminal.pv;
    };
    const dLo = band(-0.01), dHi = band(0.01);
    const Rf = optimize({...M, yTax:0, _noSens:true});
    const domBase = dominantId(refined.policy), domFlip = dominantId(Rf.refined.policy);
    const changed = domBase !== domFlip;
    sensitivity = { dLo: Math.min(dLo,dHi), dHi: Math.max(dLo,dHi), flip: { changed,
      text: changed
        ? 'Without the taxable dividend-drag assumption, the best modeled strategy changes toward "'+(domFlip==='amt'?'level conversions':(targetById(domFlip)||{label:domFlip}).label)+'" \u2014 this recommendation partly reflects the asset-location assumption, not tax brackets alone.'
        : 'The recommended strategy is unchanged when the taxable dividend-drag assumption is removed.' } };
  }
  return { baseline, strategies, refined, sensitivity };
}

export function nextCliff(magi, y, status, n65, infl){
  const f=inflF(y,infl), dedApprox = TT.stdDed[status]*f + n65*TT.addl65[status]*f;
  const cands=[];
  for(let i=0;i<TT.irmaa.thresholds[status].length;i++)
    cands.push({v:irmaaThreshAt(i,status,y,infl), k:'IRMAA'});
  cands.push({v:TT.niit.threshold[status], k:'NIIT'});
  TT.ordinary[status].slice(2).forEach(b=>cands.push({v:b[0]*f+dedApprox, k:'bracket'}));
  const up = cands.filter(c=>c.v>magi+1).sort((a,b)=>a.v-b.v)[0];
  return up || {v:magi*1.15, k:'—'};
}
