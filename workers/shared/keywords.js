// Keyword configuration for tender relevance filtering
// HIGH_CONFIDENCE: Strong match — shown prominently in green
// WORTH_A_GLANCE: Possible match — shown in amber for manual review
// All other tenders are shown greyed out at the bottom — nothing is hidden.

export const HIGH_CONFIDENCE_KEYWORDS = [
  // Transportation planning studies
  'traffic study',
  'traffic impact',
  'traffic impact assessment',
  'transportation master plan',
  'transportation plan',
  'transportation study',
  'transportation demand',
  'transportation demand management',
  'tdm',
  'active transportation',
  'active transportation plan',
  'cycling master plan',
  'cycling network',
  'cycling plan',
  'pedestrian master plan',
  'pedestrian plan',
  'transit feasibility',
  'transit study',
  'transit plan',
  'transit master plan',
  'bus rapid transit',
  'brt',
  'origin-destination study',
  'origin destination study',
  'od study',
  'corridor study',
  'road safety audit',
  'road safety',
  'vision zero',
  'complete streets',
  'parking study',
  'parking strategy',
  'parking master plan',
  'multimodal',
  'multi-modal',
  'speed limit review',
  'speed limit study',
  'environmental assessment',
  'schedule b',
  'schedule c',
  'class ea',
  'municipal class environmental',

  // Infrastructure / construction
  'road reconstruction',
  'road rehabilitation',
  'pavement rehabilitation',
  'pavement resurfacing',
  'road resurfacing',
  'microsurfacing',
  'micro-surfacing',
  'bridge rehabilitation',
  'bridge replacement',
  'bridge inspection',
  'culvert replacement',
  'culvert rehabilitation',
  'culvert installation',
  'intersection improvement',
  'intersection reconstruction',
  'signalization',
  'traffic signal',
  'traffic signals',
  'signal timing',
  'sidewalk construction',
  'sidewalk rehabilitation',
  'multi-use path',
  'multi use path',
  'mup',
  'shared use path',
  'cycling infrastructure',
  'bike lane',
  'streetlighting',
  'street lighting',
  'retaining wall',
  'grading',
  'earthworks',
  'road construction',
  'road widening',
  'roundabout',
  'interchange',
  'highway',
];

export const WORTH_A_GLANCE_KEYWORDS = [
  // Broader engineering / consulting
  'engineering services',
  'consulting services',
  'professional services',
  'master plan',
  'feasibility study',
  'feasibility assessment',
  'infrastructure study',
  'infrastructure plan',
  'infrastructure assessment',
  'asset management',
  'capital works',
  'design services',
  'functional design',
  'preliminary design',
  'detailed design',
  'geotechnical',
  'geotechnical investigation',
  'survey',
  'topographic survey',
  'drainage',
  'stormwater',
  'storm sewer',
  'erosion',

  // Community / land use (sometimes transportation is embedded)
  'community improvement plan',
  'secondary plan',
  'official plan',
  'urban design',
  'streetscape',
  'waterfront',
  'development charges',

  // General construction that might overlap
  'construction management',
  'contract administration',
  'site inspection',
  'materials testing',
];

// Helper: classify a tender by its title + description text
export function classifyTender(text) {
  const lower = text.toLowerCase();

  for (const kw of HIGH_CONFIDENCE_KEYWORDS) {
    if (lower.includes(kw)) {
      return { tier: 'high', matchedKeyword: kw };
    }
  }

  for (const kw of WORTH_A_GLANCE_KEYWORDS) {
    if (lower.includes(kw)) {
      return { tier: 'amber', matchedKeyword: kw };
    }
  }

  return { tier: 'low', matchedKeyword: null };
}
