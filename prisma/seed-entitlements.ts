import prisma from "../lib/prisma";

async function main() {
  console.log("Seeding entitlement schemes...");

  // ── BoCW Card (parent) + 14 Karnataka KBOCWWB sub-schemes ─────────────────
  const bocw = await prisma.entitlementScheme.upsert({
    where: { id: "bocw-card" },
    create: {
      id: "bocw-card",
      name: "BoCW Registration Card",
      description: "Karnataka Building & Other Construction Workers Welfare Board registration",
      parentId: null,
      sortOrder: 1,
      isActive: true,
    },
    update: { name: "BoCW Registration Card", sortOrder: 1 },
  });

  const bocwSubSchemes = [
    { id: "bocw-accident-benefit",       name: "Accident Benefit",                    description: "Compensation for injury/accident at work site",                    order: 1 },
    { id: "bocw-fatal-accident",         name: "Fatal Accident Benefit",              description: "Lump sum to family on accidental death at work",                   order: 2 },
    { id: "bocw-natural-death",          name: "Natural Death Benefit",               description: "Assistance to family on natural death of worker",                  order: 3 },
    { id: "bocw-funeral",                name: "Funeral Expenses",                    description: "One-time funeral/last rites assistance",                           order: 4 },
    { id: "bocw-permanent-disability",   name: "Permanent Total Disability Benefit",  description: "For total permanent disability from work injury",                  order: 5 },
    { id: "bocw-partial-disability",     name: "Permanent Partial Disability Benefit",description: "For partial permanent disability",                                 order: 6 },
    { id: "bocw-maternity",              name: "Maternity Benefit",                   description: "Cash assistance for female construction workers on delivery",       order: 7 },
    { id: "bocw-medical",                name: "Medical Expenses Reimbursement",      description: "Hospitalization and treatment cost reimbursement",                 order: 8 },
    { id: "bocw-education",              name: "Education Assistance (Scholarship)",  description: "Scholarships for workers' children from school through college",   order: 9 },
    { id: "bocw-marriage",               name: "Marriage Assistance",                 description: "One-time grant for worker's daughter's marriage",                  order: 10 },
    { id: "bocw-housing",                name: "Housing Loan Subsidy",                description: "Subsidized loan/assistance for house construction or purchase",    order: 11 },
    { id: "bocw-pension",                name: "Pension (Retirement Benefit)",        description: "Monthly pension on reaching 60 years with 5+ years registration",  order: 12 },
    { id: "bocw-tools",                  name: "Tools & Equipment Assistance",        description: "Subsidy for purchase of work tools and equipment",                 order: 13 },
    { id: "bocw-spectacles",             name: "Spectacles / Dental Assistance",      description: "Reimbursement for spectacles or dental treatment",                 order: 14 },
  ];

  for (const s of bocwSubSchemes) {
    await prisma.entitlementScheme.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        parentId: bocw.id,
        sortOrder: s.order,
        isActive: true,
      },
      update: { name: s.name, description: s.description, sortOrder: s.order, parentId: bocw.id },
    });
  }
  console.log(`  ✓ BoCW card + ${bocwSubSchemes.length} sub-schemes`);

  // ── Ayushman Bharat – Pradhan Mantri Jan Arogya Yojana (PMJAY) ────────────
  await prisma.entitlementScheme.upsert({
    where: { id: "ayushman-bharat" },
    create: {
      id: "ayushman-bharat",
      name: "Ayushman Bharat (PMJAY)",
      description: "₹5 lakh annual health cover per family for secondary & tertiary hospitalisation",
      parentId: null,
      sortOrder: 2,
      isActive: true,
    },
    update: { name: "Ayushman Bharat (PMJAY)", sortOrder: 2 },
  });
  console.log("  ✓ Ayushman Bharat");

  // ── CMCHIS (Tamil Nadu) ────────────────────────────────────────────────────
  await prisma.entitlementScheme.upsert({
    where: { id: "cmchis" },
    create: {
      id: "cmchis",
      name: "CMCHIS (Tamil Nadu)",
      description: "Chief Minister's Comprehensive Health Insurance Scheme — ₹5 lakh annual health cover for Tamil Nadu families",
      parentId: null,
      sortOrder: 3,
      isActive: true,
    },
    update: { name: "CMCHIS (Tamil Nadu)", sortOrder: 3 },
  });
  console.log("  ✓ CMCHIS");

  // ── Pensions ───────────────────────────────────────────────────────────────
  const pensions = [
    { id: "pension-old-age",   name: "Old Age Pension (Sandhya Suraksha)",  description: "Monthly pension for elderly 60+ below poverty line",          order: 1 },
    { id: "pension-widow",     name: "Widow Pension",                        description: "Monthly pension for widows below poverty line",               order: 2 },
    { id: "pension-disability",name: "Disability Pension",                   description: "Monthly pension for persons with 40%+ disability",           order: 3 },
  ];

  const pensionParent = await prisma.entitlementScheme.upsert({
    where: { id: "pensions-parent" },
    create: {
      id: "pensions-parent",
      name: "Pensions",
      description: "Social security pensions — old age, widow, disability",
      parentId: null,
      sortOrder: 3,
      isActive: true,
    },
    update: { name: "Pensions", sortOrder: 3 },
  });

  for (const p of pensions) {
    await prisma.entitlementScheme.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        description: p.description,
        parentId: pensionParent.id,
        sortOrder: p.order,
        isActive: true,
      },
      update: { name: p.name, description: p.description, sortOrder: p.order, parentId: pensionParent.id },
    });
  }
  console.log("  ✓ Pensions (old age, widow, disability)");

  // ── Scholarships (non-BoCW) ────────────────────────────────────────────────
  const scholarshipParent = await prisma.entitlementScheme.upsert({
    where: { id: "scholarships-parent" },
    create: {
      id: "scholarships-parent",
      name: "Scholarships",
      description: "Government scholarships for SC/ST/OBC and minority students",
      parentId: null,
      sortOrder: 4,
      isActive: true,
    },
    update: { name: "Scholarships", sortOrder: 4 },
  });

  const scholarships = [
    { id: "scholarship-pre-matric",  name: "Pre-Matric Scholarship",  description: "Class 1–10 SC/ST/OBC students",       order: 1 },
    { id: "scholarship-post-matric", name: "Post-Matric Scholarship", description: "Class 11+ SC/ST/OBC students",        order: 2 },
    { id: "scholarship-minority",    name: "Minority Scholarship",    description: "Pre/post matric for minority students", order: 3 },
  ];

  for (const s of scholarships) {
    await prisma.entitlementScheme.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        parentId: scholarshipParent.id,
        sortOrder: s.order,
        isActive: true,
      },
      update: { name: s.name, description: s.description, sortOrder: s.order, parentId: scholarshipParent.id },
    });
  }
  console.log("  ✓ Scholarships");

  // ── Housing Rights ─────────────────────────────────────────────────────────
  const housingParent = await prisma.entitlementScheme.upsert({
    where: { id: "housing-rights-parent" },
    create: {
      id: "housing-rights-parent",
      name: "Housing Rights",
      description: "Land tenure and housing documents",
      parentId: null,
      sortOrder: 5,
      isActive: true,
    },
    update: { name: "Housing Rights", sortOrder: 5 },
  });

  const housingSchemes = [
    { id: "housing-hakkupatra",  name: "Hakkupatra",  description: "Occupancy rights certificate for slum dwellers",      order: 1 },
    { id: "housing-sale-deed",   name: "Sale Deed",   description: "Registered sale deed / property ownership document",   order: 2 },
    { id: "housing-pmay",        name: "PMAY (Urban)","description": "Pradhan Mantri Awas Yojana — affordable housing",    order: 3 },
  ];

  for (const s of housingSchemes) {
    await prisma.entitlementScheme.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        parentId: housingParent.id,
        sortOrder: s.order,
        isActive: true,
      },
      update: { name: s.name, description: s.description, sortOrder: s.order, parentId: housingParent.id },
    });
  }
  console.log("  ✓ Housing rights (Hakkupatra, Sale Deed, PMAY)");

  // ── Standalone schemes ─────────────────────────────────────────────────────
  const standalone = [
    { id: "ration-card",      name: "Ration Card (NFSA)",           description: "National Food Security Act — PDS rice/wheat entitlement",         order: 6 },
    { id: "aadhaar",          name: "Aadhaar Card",                  description: "Biometric identity document — gateway to most entitlements",     order: 7 },
    { id: "janani-suraksha",  name: "Janani Suraksha Yojana (JSY)",  description: "Cash incentive for institutional delivery",                      order: 8 },
    { id: "pm-matru-vandana", name: "PM Matru Vandana Yojana",       description: "Maternity benefit ₹5000 for first live birth",                  order: 9 },
    { id: "sukanya",          name: "Sukanya Samriddhi Yojana",      description: "Savings scheme for girl child",                                  order: 10 },
  ];

  for (const s of standalone) {
    await prisma.entitlementScheme.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        parentId: null,
        sortOrder: s.order,
        isActive: true,
      },
      update: { name: s.name, description: s.description, sortOrder: s.order },
    });
  }
  console.log("  ✓ Standalone schemes (Ration card, Aadhaar, JSY, PMMVY, Sukanya)");

  const total = await prisma.entitlementScheme.count();
  console.log(`\nDone — ${total} entitlement schemes seeded.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
