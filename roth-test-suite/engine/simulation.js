import { computeYear, ordRateAt } from './taxEngine.js';
import { irmaaTier, irmaaAnnualPerPerson } from './irmaa.js';
import { rmdAge, ultAt } from './rmd.js';
import { targetById } from './strategies.js';

export function simulate(M, policy){
  const sp = M.spouses.map(s=>({ ...s }));
  let rothBal = M.roth, taxBal = M.taxable;
  const st0 = M.status==='single' ? 'single' : 'mfj';
  const ledger = {};
  ledger[M.startYear-2]={magi:M.magiPrev2||0, status:st0};
  ledger[M.startYear-1]={magi:M.magiPrev1||0, status:st0};
  const rows = [];
  let taxNom=0, taxPV=0, irmNom=0, irmPV=0, convTot=0, convTaxTot=0, rmdMargW=0, rmdW=0;
  const transferred = new Set();
  const endY = Math.max(...M.spouses.map(s => s.deathAge!=null ? s.by+s.deathAge : s.by+M.endAge));

  for(let y=M.startYear; y<=endY; y++){
    let pendingBeneRMD = 0;   // beneficiary year-of-death RMD forced into this year's income (flag-gated)
    // survivor transition (year after modeled death)
    sp.forEach((s,idx)=>{
      if(s.deathAge!=null && (y - s.by) > s.deathAge && !transferred.has(idx)){
        transferred.add(idx);
        const surv = sp.find((o,j)=>j!==idx && (o.deathAge==null || (y-o.by)<=o.deathAge));
        if(surv){
          // Year-of-death RMD handling (stress assumption, NOT a precise legal
          // remaining-RMD calculation). By default the decedent takes a full-year
          // RMD in the death year via the normal `living` loop below
          // (assumeYearOfDeathRMDSatisfied === true: the final-year RMD was satisfied
          // before death).
          //
          // When the flag is false, we model the STRESS case "force an additional
          // beneficiary RMD if the final-year RMD was not otherwise satisfied": an
          // extra RMD is taken on the inherited balance in the transfer year using
          // the decedent's death-year divisor, and surfaced as ordinary income to
          // the survivor. This does NOT detect whether an obligation actually exists
          // and does NOT compute an exact unsatisfied remainder — it is a disclosed
          // planning stress toggle, engine-only, and is not exposed in the UI. A
          // tax-accurate module would refine this.
          const assumeSatisfied = M.assumeYearOfDeathRMDSatisfied !== false; // default true
          if(!assumeSatisfied && s.trad > 0){
            const deathAgeYr = s.deathAge;
            if(deathAgeYr >= rmdAge(s.by)){
              const forced = s.trad / ultAt(deathAgeYr);
              s.trad -= forced;
              pendingBeneRMD += forced;   // added to survivor's ordinary income this year
            }
          }
          surv.trad += s.trad;
          surv.ss    = Math.max(surv.ss, s.ss);
          surv.pen  += s.pen * M.penSurv;
        }
        s.trad = 0;
      }
    });
    const living = sp.filter(s => s.deathAge==null || (y - s.by) <= s.deathAge);
    if(!living.length) break;
    const status = (M.status==='single' || living.length===1) ? 'single' : 'mfj';
    const ages   = living.map(s => y - s.by);
    const n65    = living.filter(s => y - s.by >= 65).length;
    const colaF  = Math.pow(1+M.cola, y - M.startYear);

    let ss=0, pen=0, oth=0, rmdSum=0;
    living.forEach(s=>{
      const age = y - s.by;
      if(age >= s.ssAge) ss += s.ss*colaF;
      pen += s.pen;
      if(age < s.othEnd) oth += s.oth;
      if(age >= rmdAge(s.by) && s.trad > 0){ const r = s.trad/ultAt(age); s.trad -= r; rmdSum += r; }
    });
    const qdi = M.yTax * taxBal;
    const tei = (M.taxExemptInterest || 0) * colaF;   // muni interest, grown with COLA; 0 if unset
    const ordBase = pen + oth + rmdSum + pendingBeneRMD;
    const base = {year:y, status, n65, ss, qdi, taxExemptInterest:tei, infl:M.infl, stateRate:M.stateRate};
    const res0 = computeYear({...base, ordinary:ordBase});

    // baseline RMD marginal (for arbitrage summary)
    if(rmdSum > 0){
      const d = Math.min(1000, rmdSum);
      const m = (res0.tax - computeYear({...base, ordinary:ordBase-d}).tax)/d;
      rmdMargW += m*rmdSum; rmdW += rmdSum;
    }

    // conversion per policy
    let conv = 0;
    const tdef = policy.perYear[y];
    const tradTot0 = living.reduce((a,s)=>a+s.trad,0);
    if(tdef && tradTot0 > 1){
      if(tdef.kind==='amt'){ conv = Math.min(tdef.amt, tradTot0); }
      else if(tdef.id && tdef.id!=='none'){
        const t = targetById(tdef.id);
        const tgt = t.fn(y, status, M.infl);
        const meas = c => { const r = computeYear({...base, ordinary:ordBase+c}); return t.kind==='ti' ? r.ti : r.magi; };
        if(meas(0) < tgt){
          if(meas(tradTot0) <= tgt) conv = tradTot0;
          else { let lo=0, hi=tradTot0;
            for(let i=0;i<45;i++){ const mid=(lo+hi)/2; (meas(mid)<=tgt) ? lo=mid : hi=mid; }
            conv = lo; }
        }
      }
    }
    if(conv < 1) conv = 0;
    if(conv > 0){ living.forEach(s=>{ s.trad -= conv*(s.trad/tradTot0); }); }

    const res = conv>0 ? computeYear({...base, ordinary:ordBase+conv}) : res0;
    const marg = conv>0 ? (res.tax - res0.tax)/conv : null;
    const topRate = conv>0 ? ordRateAt(Math.max(0, res.ti - qdi), status, y, M.infl) : null;
    let marg10k = null;   // marginal rate on the last $10k converted — the "edge cost" of converting a little more
    if(conv > 0){
      const d = Math.min(10000, conv);
      marg10k = (res.tax - computeYear({...base, ordinary:ordBase+conv-d}).tax)/d;
    }
    if(conv>0){ convTot += conv; convTaxTot += (res.tax-res0.tax); }

    // IRMAA this year's MAGI will cause two years out (projected enrollment then)
    const futY = y+2;
    const futEnrolled = living.filter(s => (s.deathAge==null || futY-s.by <= s.deathAge) && futY-s.by >= 65).length;
    const futTier = irmaaTier(res.magi, status, futY, M.infl);
    const irmCaused = irmaaAnnualPerPerson(futTier, futY, M.infl) * futEnrolled;

    // IRMAA — two-year MAGI lookback, current-year tiers & filing status
    const enrolled = living.filter(s => y - s.by >= 65).length;
    const lk = ledger[y-2] || {magi:0, status};
    const tier = enrolled>0 ? irmaaTier(lk.magi, lk.status, y, M.infl) : -1;
    const irm  = irmaaAnnualPerPerson(tier, y, M.infl) * enrolled;
    ledger[y] = {magi:res.magi, status};

    // cashflow: RMD lands in taxable; all taxes + IRMAA paid from taxable
    taxBal += rmdSum + pendingBeneRMD;
    taxBal -= (res.tax + irm);
    let flag=false, rothIn=conv, unpaid=0;
    if(taxBal < 0){
      let short = -taxBal; taxBal = 0; flag = true;
      const fromConv = Math.min(short, conv); rothIn = conv - fromConv; short -= fromConv;
      if(short > 0){ // beyond the conversion: approximate with Roth then pre-tax draws (no gross-up) and flag
        unpaid = short;
        const fromRoth = Math.min(short, rothBal); rothBal -= fromRoth; short -= fromRoth;
        if(short > 0){ living.forEach(s=>{ const take = Math.min(short*(s.trad/Math.max(1,living.reduce((a,x)=>a+x.trad,0))), s.trad); s.trad -= take; }); }
      }
    }
    rothBal += rothIn;

    // growth
    sp.forEach(s=>{ s.trad *= (1+M.gTrad); });
    rothBal *= (1+M.gRoth); taxBal *= (1+M.gTax);

    const tradEndY = sp.reduce((a,s)=>a+s.trad,0);
    const pvF = 1/Math.pow(1+M.disc, y - M.startYear);
    taxNom += res.tax; taxPV += res.tax*pvF; irmNom += irm; irmPV += irm*pvF;
    rows.push({y, ages:ages.join("/"), status, ss, penoth:pen+oth, rmd:rmdSum+pendingBeneRMD, conv, marg, qdi, n65,
               beneRMD:pendingBeneRMD,
               topRate, marg10k, irmCaused, futTier,
               taxSS:res.taxSS, magi:res.magi, baseMagi:res0.magi, ti:res.ti,
               tax:res.tax, irm, tier, flag, unpaid,
               trad:tradEndY, roth:rothBal, taxable:taxBal,
               wealth: taxBal + rothBal + tradEndY*(1-M.heir), pvF});
  }
  const last = rows[rows.length-1];
  const tradEnd = last ? last.trad : 0;
  const heirNom = tradEnd*M.heir, heirPV = last ? heirNom*last.pvF : 0;
  return { policy, rows,
    failed: rows.some(r=>r.unpaid>0),
    tax:{nom:taxNom, pv:taxPV}, irm:{nom:irmNom, pv:irmPV},
    heir:{nom:heirNom, pv:heirPV},
    total:{nom:taxNom+irmNom+heirNom, pv:taxPV+irmPV+heirPV},
    terminal:{nom: last?last.wealth:0, pv: last?last.wealth*last.pvF:0},
    convTot, convMarg: convTot>0 ? convTaxTot/convTot : null,
    rmdMarg: rmdW>0 ? rmdMargW/rmdW : null };
}
