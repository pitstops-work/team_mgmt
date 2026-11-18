// GENERATED from the live definitions on 16 Nov 2026 — the 24-point creche
// safety audit (IndicatorChecklistItemDef, creche_hygiene_score) and the 93
// caregiver practices (CaregiverPractice). Starter data only: once loaded, the
// lists live in the Creche programme's settings and are edited there.
import type { ListPoint } from "../settings";

export const CRECHE_SAFETY_24: ListPoint[] = [
  {
    "key": "roof-walls-structural-safety",
    "text": "Roof and walls are structurally safe",
    "category": "Infrastructural & Environmental Safety",
    "non_negotiable": true
  },
  {
    "key": "rain-leakage-protection",
    "text": "Creche is protected from rainwater leakage",
    "category": "Infrastructural & Environmental Safety",
    "non_negotiable": true
  },
  {
    "key": "no-well-within-20m",
    "text": "No well or tube-well within 20 m of the creche",
    "category": "Infrastructural & Environmental Safety",
    "non_negotiable": true
  },
  {
    "key": "well-covered-iron-net",
    "text": "Well/tube-well within 20 m is covered with iron net inside and outside (N/A if no well)",
    "category": "Infrastructural & Environmental Safety",
    "non_negotiable": true,
    "na_allowed": true
  },
  {
    "key": "sharp-cutters-machinery-away",
    "text": "Sharp edge cutters or machinery kept away from the creche",
    "category": "Infrastructural & Environmental Safety",
    "non_negotiable": true
  },
  {
    "key": "external-fencing",
    "text": "External fencing around the creche",
    "category": "Physical Safety & Security"
  },
  {
    "key": "safety-gate-main-entrance",
    "text": "Safety gate at the main entrance",
    "category": "Physical Safety & Security",
    "non_negotiable": true
  },
  {
    "key": "safety-gate-kitchen-entrance",
    "text": "Safety gate at the kitchen entrance",
    "category": "Physical Safety & Security",
    "non_negotiable": true
  },
  {
    "key": "secured-against-animals",
    "text": "Secured against entry of poisonous animals (snakes, scorpions) and domestic animals (dogs, cats, cows, hens)",
    "category": "Physical Safety & Security",
    "non_negotiable": true
  },
  {
    "key": "visitor-register-non-parents",
    "text": "Entry of any person other than parents recorded in the visitor's register",
    "category": "Physical Safety & Security"
  },
  {
    "key": "gas-stove-separate-slab",
    "text": "Separate slab or table for the gas stove, positioned above cylinder height",
    "category": "Fire Safety",
    "non_negotiable": true
  },
  {
    "key": "fire-extinguisher-working",
    "text": "Fire extinguisher available and in working condition",
    "category": "Fire Safety",
    "non_negotiable": true
  },
  {
    "key": "fire-blankets-buckets-kitchen",
    "text": "Fire blankets and fire buckets available in the kitchen",
    "category": "Fire Safety",
    "non_negotiable": true
  },
  {
    "key": "caregiver-pressure-cooker-confident",
    "text": "Caregiver is confident in handling a pressure cooker",
    "category": "Fire Safety"
  },
  {
    "key": "electrical-connections-out-of-reach",
    "text": "All electrical connections positioned out of children's reach",
    "category": "Electrical Safety",
    "non_negotiable": true
  },
  {
    "key": "fans-lights-safe-height",
    "text": "Fans and lights installed at a safe location and height",
    "category": "Electrical Safety",
    "non_negotiable": true
  },
  {
    "key": "solar-panels-batteries-out-of-reach",
    "text": "Solar panels or batteries kept out of children's reach (N/A if none)",
    "category": "Electrical Safety",
    "non_negotiable": true,
    "na_allowed": true
  },
  {
    "key": "lightning-arrestors-installed",
    "text": "Lightning arrestors installed in the creche building",
    "category": "Electrical Safety"
  },
  {
    "key": "fifo-grains-rice",
    "text": "Food grains and rice utilised first-in-first-out",
    "category": "Food Safety",
    "non_negotiable": true
  },
  {
    "key": "periodic-egg-floating-tests",
    "text": "Egg floating tests done periodically to check egg quality",
    "category": "Food Safety",
    "non_negotiable": true
  },
  {
    "key": "leftover-food-disposed-daily",
    "text": "Leftover food disposed of properly every day",
    "category": "Food Safety",
    "non_negotiable": true
  },
  {
    "key": "two-caregivers-present",
    "text": "Creche running with two caregivers during the visit",
    "category": "Others",
    "non_negotiable": true
  },
  {
    "key": "first-aid-box-equipped",
    "text": "Fully equipped first-aid box available in the creche",
    "category": "Others",
    "non_negotiable": true
  },
  {
    "key": "emergency-contacts-displayed",
    "text": "Emergency contact numbers clearly displayed",
    "category": "Others"
  }
];

export const CAREGIVER_PRACTICES: ListPoint[] = [
  {
    "key": "cp-01",
    "text": "Opens and closes centre on time every day as agreed by the community in different seasons.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-01",
      "subcategory": "Opening, closing & handover",
      "label": "Opens/closes on time",
      "training_module": 4
    }
  },
  {
    "key": "cp-02",
    "text": "Receives children with a smile from parents in the morning and inquires about their current health status.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-02",
      "subcategory": "Opening, closing & handover",
      "label": "Warm receiving + health check",
      "training_module": 4
    }
  },
  {
    "key": "cp-03",
    "text": "Hands over children safely to parents or designated guardians at the time of closing the centre.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-03",
      "subcategory": "Opening, closing & handover",
      "label": "Safe handover at closing",
      "training_module": 4
    }
  },
  {
    "key": "cp-04",
    "text": "Ensures windows are open (wherever applicable) and lights are turned on.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-04",
      "subcategory": "Opening, closing & handover",
      "label": "Windows open, lights on",
      "training_module": 4
    }
  },
  {
    "key": "cp-05",
    "text": "Cleans the centre every day after opening, before children turn up, and keeps the place ready (mats/toys etc.) for children to sit.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-05",
      "subcategory": "Centre readiness & upkeep",
      "label": "Daily cleaning before children arrive",
      "training_module": 4
    }
  },
  {
    "key": "cp-06",
    "text": "Keeps the centre organised and safe for children throughout the day, especially before and after activities and meals and before closing.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-06",
      "subcategory": "Centre readiness & upkeep",
      "label": "Centre organised & safe all day",
      "training_module": 4
    }
  },
  {
    "key": "cp-07",
    "text": "Arranges materials in the kitchen and storeroom in an organised and neat manner.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-07",
      "subcategory": "Centre readiness & upkeep",
      "label": "Kitchen & storeroom organised",
      "training_module": 4
    }
  },
  {
    "key": "cp-08",
    "text": "Treats every child fairly irrespective of caste, creed, colour, gender, age, religion or socio-economic background.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-08",
      "subcategory": "Child interaction & supervision",
      "label": "Fair treatment of every child",
      "training_module": 1
    }
  },
  {
    "key": "cp-09",
    "text": "Appreciates each child for participation, engagement and effort — clapping, gestures, etc.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-09",
      "subcategory": "Child interaction & supervision",
      "label": "Appreciates every child",
      "training_module": 1
    }
  },
  {
    "key": "cp-10",
    "text": "Ensures children are attended at all times when they are at the centre.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-10",
      "subcategory": "Child interaction & supervision",
      "label": "Children attended at all times",
      "training_module": 1
    }
  },
  {
    "key": "cp-11",
    "text": "Enables conversations with the children throughout the day.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-11",
      "subcategory": "Child interaction & supervision",
      "label": "Conversations through the day",
      "training_module": 1
    }
  },
  {
    "key": "cp-12",
    "text": "Informs planned leave well in advance (3 days or before) to supervisors; helps arrange substitutes for sudden leave.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-12",
      "subcategory": "Staff discipline & equipment",
      "label": "Leave informed 3 days ahead",
      "training_module": 1
    }
  },
  {
    "key": "cp-13",
    "text": "Maintains, handles and stores anthropometric equipment properly; supports supervisors in taking measurements.",
    "category": "Common Practices",
    "meta": {
      "code": "CP-13",
      "subcategory": "Staff discipline & equipment",
      "label": "Anthropometric equipment care",
      "training_module": 1
    }
  },
  {
    "key": "cc-01",
    "text": "Assists children who struggle with feeding by sitting with them.",
    "category": "Child Care",
    "meta": {
      "code": "CC-01",
      "subcategory": "Responsive care",
      "label": "Sits with struggling feeders",
      "training_module": 3
    }
  },
  {
    "key": "cc-02",
    "text": "Responds promptly and sensitively to children's toilet needs.",
    "category": "Child Care",
    "meta": {
      "code": "CC-02",
      "subcategory": "Responsive care",
      "label": "Prompt toilet response",
      "training_module": 3
    }
  },
  {
    "key": "cc-03",
    "text": "Attends crying children with care and sensitivity.",
    "category": "Child Care",
    "meta": {
      "code": "CC-03",
      "subcategory": "Responsive care",
      "label": "Attends crying children",
      "training_module": 3
    }
  },
  {
    "key": "cc-04",
    "text": "Interacts with children with politeness, patience and love; avoids any form of corporal punishment.",
    "category": "Child Care",
    "meta": {
      "code": "CC-04",
      "subcategory": "Gentle handling & conduct",
      "label": "Politeness; no corporal punishment",
      "training_module": 3
    }
  },
  {
    "key": "cc-05",
    "text": "Physical handling — lifting, picking up, holding — is gentle and proper, with both hands.",
    "category": "Child Care",
    "meta": {
      "code": "CC-05",
      "subcategory": "Gentle handling & conduct",
      "label": "Gentle two-hand handling",
      "training_module": 3
    }
  },
  {
    "key": "cc-06",
    "text": "Promotes and encourages mothers to stay in the creche until the child adapts.",
    "category": "Child Care",
    "meta": {
      "code": "CC-06",
      "subcategory": "Parent engagement",
      "label": "Mother stays till child adapts",
      "training_module": 3
    }
  },
  {
    "key": "cc-07",
    "text": "Engages regularly with parents to discuss the child's attendance and health status.",
    "category": "Child Care",
    "meta": {
      "code": "CC-07",
      "subcategory": "Parent engagement",
      "label": "Regular parent discussions",
      "training_module": 3
    }
  },
  {
    "key": "cc-08",
    "text": "Ensures the child is dressed adequately, particularly in winter, through dialogue with parents.",
    "category": "Child Care",
    "meta": {
      "code": "CC-08",
      "subcategory": "Parent engagement",
      "label": "Adequate dressing (winter)",
      "training_module": 3
    }
  },
  {
    "key": "fn-01",
    "text": "Boils water the day before, cools and filters it before giving to children.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-01",
      "subcategory": "Drinking water",
      "label": "Boil, cool & filter water",
      "training_module": 2
    }
  },
  {
    "key": "fn-02",
    "text": "Gives adequate drinking water to children frequently.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-02",
      "subcategory": "Drinking water",
      "label": "Frequent drinking water",
      "training_module": 2
    }
  },
  {
    "key": "fn-03",
    "text": "Procures vegetables at least twice a week; none stored more than 3 days.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-03",
      "subcategory": "Procurement & storage",
      "label": "Vegetables twice a week, ≤3 days",
      "training_module": 2
    }
  },
  {
    "key": "fn-04",
    "text": "Keeps eggs in the egg storage container with proper air circulation.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-04",
      "subcategory": "Procurement & storage",
      "label": "Egg container with air circulation",
      "training_module": 2
    }
  },
  {
    "key": "fn-05",
    "text": "Follows First In, First Out (FIFO) for food grains and rice.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-05",
      "subcategory": "Procurement & storage",
      "label": "FIFO for grains & rice",
      "training_module": 2
    }
  },
  {
    "key": "fn-06",
    "text": "Checks all food items at delivery for leakages and damages.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-06",
      "subcategory": "Procurement & storage",
      "label": "Delivery check for damage",
      "training_module": 2
    }
  },
  {
    "key": "fn-07",
    "text": "Checks and segregates eggs for breakage, dirt over shell or droppings.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-07",
      "subcategory": "Egg safety",
      "label": "Egg inspection & segregation",
      "training_module": 2
    }
  },
  {
    "key": "fn-08",
    "text": "Does the float test before boiling eggs every day; segregates spoilt ones and records.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-08",
      "subcategory": "Egg safety",
      "label": "Daily float test + record",
      "training_module": 2
    }
  },
  {
    "key": "fn-09",
    "text": "Washes vegetables thoroughly before cutting and mixing into khichdi.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-09",
      "subcategory": "Cooking",
      "label": "Wash vegetables before cutting",
      "training_module": 2
    }
  },
  {
    "key": "fn-10",
    "text": "Prepares semi-solid khichdi without spices/masala, with 2-3 vegetables including at least 1 green vegetable.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-10",
      "subcategory": "Cooking",
      "label": "Khichdi: semi-solid, no masala, 2-3 veg",
      "training_module": 2
    }
  },
  {
    "key": "fn-11",
    "text": "Uses 4 ml top-up mustard oil with each meal per child, including special nutritional meals.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-11",
      "subcategory": "Cooking",
      "label": "4 ml mustard-oil top-up",
      "training_module": 2
    }
  },
  {
    "key": "fn-12",
    "text": "Tastes a small portion of cooked food to ensure desired taste and quality every time.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-12",
      "subcategory": "Cooking",
      "label": "Tastes cooked food",
      "training_module": 2
    }
  },
  {
    "key": "fn-13",
    "text": "Serves khichdi with lemon drops.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-13",
      "subcategory": "Cooking",
      "label": "Lemon drops in khichdi",
      "training_module": 2
    }
  },
  {
    "key": "fn-14",
    "text": "Encourages mothers of children below 2 years to visit the creche for breastfeeding.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-14",
      "subcategory": "Feeding practice",
      "label": "Breastfeeding visits (<2 yrs)",
      "training_module": 2
    }
  },
  {
    "key": "fn-15",
    "text": "Ensures multiple servings of food as per the appetite of the children.",
    "category": "Food & Nutrition",
    "meta": {
      "code": "FN-15",
      "subcategory": "Feeding practice",
      "label": "Multiple servings by appetite",
      "training_module": 2
    }
  },
  {
    "key": "hl-01",
    "text": "Provides 2 extra meals with oil topping to children on the Special Nutrition Care (SNC) list.",
    "category": "Health",
    "meta": {
      "code": "HL-01",
      "subcategory": "Special nutrition care",
      "label": "2 extra SNC meals with oil",
      "training_module": 3
    }
  },
  {
    "key": "hl-02",
    "text": "Provides food (at least khichdi with egg) for mothers/guardians of sick children to collect from the centre.",
    "category": "Health",
    "meta": {
      "code": "HL-02",
      "subcategory": "Special nutrition care",
      "label": "Food for sick children's guardians",
      "training_module": 3
    }
  },
  {
    "key": "hl-03",
    "text": "Informs parents, supervisors and ASHA workers immediately of any sickness or emergency.",
    "category": "Health",
    "meta": {
      "code": "HL-03",
      "subcategory": "Illness & first aid",
      "label": "Immediate sickness escalation",
      "training_module": 3
    }
  },
  {
    "key": "hl-04",
    "text": "Provides first aid (no medication) for minor injuries using the first-aid kit; informs parents, ASHA and supervisor immediately.",
    "category": "Health",
    "meta": {
      "code": "HL-04",
      "subcategory": "Illness & first aid",
      "label": "First aid, no medication",
      "training_module": 3
    }
  },
  {
    "key": "hl-05",
    "text": "Creates a conducive environment, sets up the sleeping area and ensures adequate sleep duration (60-90 minutes).",
    "category": "Health",
    "meta": {
      "code": "HL-05",
      "subcategory": "Sleep",
      "label": "Sleep setup, 60-90 min",
      "training_module": 3
    }
  },
  {
    "key": "hl-06",
    "text": "Co-facilitates and supports supervisors in organising monthly CMC meetings on nutrition, health and related issues.",
    "category": "Health",
    "meta": {
      "code": "HL-06",
      "subcategory": "Community health",
      "label": "Supports monthly CMC meetings",
      "training_module": 3
    }
  },
  {
    "key": "ss-01",
    "text": "Communicates with parents to check the child's pockets for coins, toys, junk food before handover.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-01",
      "subcategory": "Entry, handover & visitors",
      "label": "Pocket check with parents",
      "training_module": 1
    }
  },
  {
    "key": "ss-02",
    "text": "Checks and enquires about any visitor apart from parents, verifies with the supervisor and ensures visitor-register entries.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-02",
      "subcategory": "Entry, handover & visitors",
      "label": "Visitor verification & register",
      "training_module": 1
    }
  },
  {
    "key": "ss-03",
    "text": "Ensures corners, gates and walls are blunt and smooth, posing no harm to children.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-03",
      "subcategory": "Premises condition",
      "label": "Blunt, smooth corners & walls",
      "training_module": 1
    }
  },
  {
    "key": "ss-04",
    "text": "Checks for waterlogging in and around the premises; takes supervisor/community support to resolve it.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-04",
      "subcategory": "Premises condition",
      "label": "No waterlogging",
      "training_module": 1
    }
  },
  {
    "key": "ss-05",
    "text": "Checks materials and flooring for fungal growth in the rainy season; regularly sun-dries dry ration, bedding and linen.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-05",
      "subcategory": "Premises condition",
      "label": "Anti-fungal checks & sun-drying",
      "training_module": 1
    }
  },
  {
    "key": "ss-06",
    "text": "Covers gaps in doors, windows, wall cracks and floor holes; stays vigilant against entry of cats, dogs, hens, snakes, insects.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-06",
      "subcategory": "Premises condition",
      "label": "Gaps sealed; animal entry blocked",
      "training_module": 1
    }
  },
  {
    "key": "ss-07",
    "text": "Keeps safety gates (kitchen and entrance) always closed.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-07",
      "subcategory": "Hazard control",
      "label": "Safety gates always closed",
      "training_module": 1
    }
  },
  {
    "key": "ss-08",
    "text": "Keeps knives, scissors and sharp objects in the kitchen/storeroom at height, away from children's reach.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-08",
      "subcategory": "Hazard control",
      "label": "Sharp objects out of reach",
      "training_module": 1
    }
  },
  {
    "key": "ss-09",
    "text": "Ensures heavy objects are kept appropriately and away from children's reach.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-09",
      "subcategory": "Hazard control",
      "label": "Heavy objects secured",
      "training_module": 1
    }
  },
  {
    "key": "ss-10",
    "text": "Places all toiletries away from children's reach.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-10",
      "subcategory": "Hazard control",
      "label": "Toiletries out of reach",
      "training_module": 1
    }
  },
  {
    "key": "ss-11",
    "text": "Checks for broken and small toys and removes them regularly.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-11",
      "subcategory": "Hazard control",
      "label": "Broken/small toys removed",
      "training_module": 1
    }
  },
  {
    "key": "ss-12",
    "text": "Keeps fire extinguishers, blankets and sand buckets away from children's reach but easy to access in an emergency.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-12",
      "subcategory": "Fire safety",
      "label": "Fire equipment placed right",
      "training_module": 4
    }
  },
  {
    "key": "ss-13",
    "text": "Puts off LPG stove knobs and cylinder regulator after every use; extinguishes wood fire with water after use.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-13",
      "subcategory": "Fire safety",
      "label": "LPG/wood fire off after use",
      "training_module": 4
    }
  },
  {
    "key": "ss-14",
    "text": "Properly covers raw materials, cooked food and water containers with lids, including during mealtime.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-14",
      "subcategory": "Meal-time safety",
      "label": "Food & water covered",
      "training_module": 1
    }
  },
  {
    "key": "ss-15",
    "text": "Serves meals lukewarm; checks heat by tasting and testing on the back of the palm.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-15",
      "subcategory": "Meal-time safety",
      "label": "Lukewarm serving, heat-tested",
      "training_module": 1
    }
  },
  {
    "key": "ss-16",
    "text": "Keeps hot utensils away from children during mealtimes.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-16",
      "subcategory": "Meal-time safety",
      "label": "Hot utensils away from children",
      "training_module": 1
    }
  },
  {
    "key": "ss-17",
    "text": "Uses mosquito nets fixed firmly on all four sides, tucked under the mattress, throughout sleep/nap time.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-17",
      "subcategory": "Sleep safety",
      "label": "Mosquito nets tucked all sides",
      "training_module": 1
    }
  },
  {
    "key": "ss-18",
    "text": "Ensures children below one year sleep on their back, not side or stomach, during naps.",
    "category": "Safety & Security",
    "meta": {
      "code": "SS-18",
      "subcategory": "Sleep safety",
      "label": "Under-1s sleep on back",
      "training_module": 1
    }
  },
  {
    "key": "hc-01",
    "text": "Washes play materials daily to keep them clean.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-01",
      "subcategory": "Daily cleaning",
      "label": "Play materials washed daily",
      "training_module": 3
    }
  },
  {
    "key": "hc-02",
    "text": "Cleans the toilet every day; flushes after every use.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-02",
      "subcategory": "Daily cleaning",
      "label": "Toilet cleaned daily, flushed",
      "training_module": 3
    }
  },
  {
    "key": "hc-03",
    "text": "Cleans daily-use items — utensils, handwashing bucket, tub, dining mats, bibs — after use.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-03",
      "subcategory": "Daily cleaning",
      "label": "Daily-use items cleaned",
      "training_module": 3
    }
  },
  {
    "key": "hc-04",
    "text": "Cleans kitchen slab, gas stove, play area, tables and door knobs daily; keeps utensils in fixed places.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-04",
      "subcategory": "Daily cleaning",
      "label": "Kitchen & surfaces cleaned daily",
      "training_module": 3
    }
  },
  {
    "key": "hc-05",
    "text": "Dusts mattresses, bedsheets and mosquito nets before every use.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-05",
      "subcategory": "Linen & bedding",
      "label": "Bedding dusted before use",
      "training_module": 3
    }
  },
  {
    "key": "hc-06",
    "text": "Washes bedsheets weekly and mosquito nets once a month.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-06",
      "subcategory": "Linen & bedding",
      "label": "Sheets weekly, nets monthly",
      "training_module": 3
    }
  },
  {
    "key": "hc-07",
    "text": "Washes towels, handkerchiefs, bibs and aprons regularly.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-07",
      "subcategory": "Linen & bedding",
      "label": "Towels, bibs, aprons washed",
      "training_module": 3
    }
  },
  {
    "key": "hc-08",
    "text": "Washes hands before and after cooking and feeding children.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-08",
      "subcategory": "Caregiver handwashing",
      "label": "Hands washed: cooking & feeding",
      "training_module": 3
    }
  },
  {
    "key": "hc-09",
    "text": "Washes/disinfects hands after cleaning a child's nose and after assisting with toileting.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-09",
      "subcategory": "Caregiver handwashing",
      "label": "Hands washed: nose & toileting",
      "training_module": 3
    }
  },
  {
    "key": "hc-10",
    "text": "Promotes mothers washing hands before breastfeeding and feeding children.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-10",
      "subcategory": "Caregiver handwashing",
      "label": "Mothers wash hands pre-feeding",
      "training_module": 3
    }
  },
  {
    "key": "hc-11",
    "text": "Ensures children's handwashing before and after meals.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-11",
      "subcategory": "Child hygiene habits",
      "label": "Children's hands: before/after meals",
      "training_module": 3
    }
  },
  {
    "key": "hc-12",
    "text": "Ensures children wash hands after toilet use.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-12",
      "subcategory": "Child hygiene habits",
      "label": "Children's hands: after toilet",
      "training_module": 3
    }
  },
  {
    "key": "hc-13",
    "text": "Encourages children to eat food with their hands.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-13",
      "subcategory": "Child hygiene habits",
      "label": "Eating with hands encouraged",
      "training_module": 3
    }
  },
  {
    "key": "hc-14",
    "text": "Grooms the child every day by combing; checks/trims nails weekly.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-14",
      "subcategory": "Child hygiene habits",
      "label": "Daily grooming; weekly nails",
      "training_module": 3
    }
  },
  {
    "key": "hc-15",
    "text": "Disposes of children's faecal matter safely.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-15",
      "subcategory": "Waste & sanitation",
      "label": "Safe faecal disposal",
      "training_module": 3
    }
  },
  {
    "key": "hc-16",
    "text": "Disposes of leftover food properly every day.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-16",
      "subcategory": "Waste & sanitation",
      "label": "Leftover food disposed daily",
      "training_module": 3
    }
  },
  {
    "key": "hc-17",
    "text": "Maintains two separate bags for nose-cleaning cloths (clean vs used); disposes used cloths daily.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-17",
      "subcategory": "Waste & sanitation",
      "label": "Two-bag nose-cloth system",
      "training_module": 3
    }
  },
  {
    "key": "hc-18",
    "text": "Uses dustpan and closed dustbin for waste disposal.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-18",
      "subcategory": "Waste & sanitation",
      "label": "Dustpan & closed dustbin",
      "training_module": 3
    }
  },
  {
    "key": "hc-19",
    "text": "Drains used water from kitchen and wash area safely.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-19",
      "subcategory": "Waste & sanitation",
      "label": "Safe drainage of used water",
      "training_module": 3
    }
  },
  {
    "key": "hc-20",
    "text": "Ensures no spitting inside the creche and premises; prohibits tobacco and alcohol in and around the creche.",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-20",
      "subcategory": "Premises norms & self-hygiene",
      "label": "No spitting, tobacco, alcohol",
      "training_module": 3
    }
  },
  {
    "key": "hc-21",
    "text": "Maintains adequate self-hygiene (trimmed nails, clean clothes etc.).",
    "category": "Hygiene & Cleanliness",
    "meta": {
      "code": "HC-21",
      "subcategory": "Premises norms & self-hygiene",
      "label": "Caregiver self-hygiene",
      "training_module": 3
    }
  },
  {
    "key": "ce-01",
    "text": "Engages in physical activities with children every day — walking, throwing balls, jumping, picking blocks.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-01",
      "subcategory": "Physical & material play",
      "label": "Daily physical activities",
      "training_module": 3
    }
  },
  {
    "key": "ce-02",
    "text": "Converses with children using play materials — talking about and around the materials.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-02",
      "subcategory": "Physical & material play",
      "label": "Conversation around materials",
      "training_module": 3
    }
  },
  {
    "key": "ce-03",
    "text": "Distributes toys/play materials and engages children age-appropriately.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-03",
      "subcategory": "Physical & material play",
      "label": "Age-appropriate toy distribution",
      "training_module": 3
    }
  },
  {
    "key": "ce-04",
    "text": "Sings rhymes every day with actions and expressions, preferably in the local language.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-04",
      "subcategory": "Language, rhymes & stories",
      "label": "Daily rhymes with actions",
      "training_module": 3
    }
  },
  {
    "key": "ce-05",
    "text": "Narrates short stories in the local language; picture cards/puppets may be used.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-05",
      "subcategory": "Language, rhymes & stories",
      "label": "Short stories in local language",
      "training_module": 3
    }
  },
  {
    "key": "ce-06",
    "text": "Gives ample opportunities and encourages all children to participate, keeping individual pace and interest in mind.",
    "category": "Child Engagement",
    "meta": {
      "code": "CE-06",
      "subcategory": "Inclusion",
      "label": "All children participate",
      "training_module": 3
    }
  },
  {
    "key": "rk-01",
    "text": "Records attendance of children and self every day in the attendance register.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-01",
      "subcategory": "Daily registers",
      "label": "Attendance register daily",
      "training_module": 4
    }
  },
  {
    "key": "rk-02",
    "text": "Records total attendance and meal count (entry after every meal) daily and monthly.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-02",
      "subcategory": "Daily registers",
      "label": "Meal count after every meal",
      "training_module": 4
    }
  },
  {
    "key": "rk-03",
    "text": "Maintains cashbook entries regularly in the register.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-03",
      "subcategory": "Daily registers",
      "label": "Cashbook maintained",
      "training_module": 4
    }
  },
  {
    "key": "rk-04",
    "text": "Maintains a register for egg spoilage and usage on a daily basis.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-04",
      "subcategory": "Daily registers",
      "label": "Egg spoilage & usage register",
      "training_module": 4
    }
  },
  {
    "key": "rk-05",
    "text": "Covers and keeps all registers, including child cards, accessible and protected from damage.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-05",
      "subcategory": "Register upkeep",
      "label": "Registers covered & protected",
      "training_module": 4
    }
  },
  {
    "key": "rk-06",
    "text": "Communicates egg and material requirements at least two days in advance to supervisors.",
    "category": "Record Keeping",
    "meta": {
      "code": "RK-06",
      "subcategory": "Indenting",
      "label": "Supplies indented 2 days ahead",
      "training_module": 4
    }
  }
];
