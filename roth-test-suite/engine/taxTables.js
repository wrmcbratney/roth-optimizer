// Tax constants and source metadata. Version-dated; verify against IRS Rev. Proc. and CMS IRMAA notice each January.
// Extracted from TRS_Roth_Conversion_Optimizer_4_.html (v2026.4). Behavior-preserving extraction.

export const TT = {
  version: "Tax tables v2026.4",
  sources: [
    { name: "IRS Rev. Proc. 2025-32 (2026 inflation adjustments)",
      url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf", effectiveYear: 2026 },
    { name: "CMS 2026 Medicare Parts A & B Premiums and Deductibles notice",
      url: "", effectiveYear: 2026 },
    { name: "SSA 2026 IRMAA determination tables",
      url: "", effectiveYear: 2026 }
  ],
  review: { reviewedBy: "", reviewedDate: "" },   // blank reviewedDate = signoff pending
  BASE_YEAR: 2026,
  ordinary: { // [lower bound, rate] — indexed
    mfj:   [[0,.10],[24800,.12],[100800,.22],[211400,.24],[403550,.32],[512450,.35],[768700,.37]],
    single:[[0,.10],[12400,.12],[50400,.22],[105700,.24],[201775,.32],[256225,.35],[640600,.37]]
  },
  ltcg: { // [lower bound, rate] stacked above ordinary TI — indexed
    mfj:   [[0,0],[98900,.15],[613700,.20]],
    single:[[0,0],[49450,.15],[545500,.20]]
  },
  stdDed:   { mfj:32200, single:16100 },        // indexed
  addl65:   { mfj:1650,  single:2050 },         // per person 65+ — indexed
  seniorBonus: { amt:6000, lastYear:2028, rate:.06,
                 threshold:{ mfj:150000, single:75000 } },  // amt & threshold FROZEN (statute)
  ssThresh: { mfj:[32000,44000], single:[25000,34000] },    // FROZEN since enactment
  niit:     { rate:.038, threshold:{ mfj:250000, single:200000 } }, // FROZEN
  irmaa: {  // CMS 2026 (based on 2024 MAGI). Tiers 1–4 indexed; top tier statutorily frozen, indexable from 2028
    thresholds:{ mfj:[218000,274000,342000,410000,750000],
                 single:[109000,137000,171000,205000,500000] },
    surchB:[81.20,202.90,324.60,446.30,487.00],   // monthly Part B surcharge above the $202.90 standard
    surchD:[14.50,37.50,60.40,83.30,91.00],       // monthly Part D IRMAA
    topTierIndexFrom: 2028
  },
  ult: {72:27.4,73:26.5,74:25.5,75:24.6,76:23.7,77:22.9,78:22.0,79:21.1,80:20.2,81:19.4,
        82:18.5,83:17.7,84:16.8,85:16.0,86:15.2,87:14.4,88:13.7,89:12.9,90:12.2,91:11.5,
        92:10.8,93:10.1,94:9.5,95:8.9,96:8.4,97:7.8,98:7.3,99:6.8,100:6.4,101:6.0,102:5.6,
        103:5.2,104:4.9,105:4.6,106:4.3,107:4.1,108:3.9,109:3.7,110:3.5,111:3.4,112:3.3,
        113:3.1,114:3.0,115:2.9,116:2.8,117:2.7,118:2.5,119:2.3,120:2.0}
};
