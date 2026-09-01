export const RESEARCH_SOURCES_VERSION = 1;

export const RESEARCH_SOURCES = [
  {
    id: "who-physical-activity-2020",
    title: "WHO guidelines on physical activity and sedentary behaviour",
    organization: "World Health Organization",
    year: 2020,
    url: "https://www.who.int/publications/i/item/9789240015128",
    supports: ["gradual-progression", "regular-physical-activity"],
    reviewedAt: "2026-09-01"
  },
  {
    id: "foster-session-rpe-2001",
    title: "A new approach to monitoring exercise training",
    organization: "Journal of Strength and Conditioning Research",
    year: 2001,
    url: "https://pubmed.ncbi.nlm.nih.gov/11708692/",
    supports: ["session-rpe-monitoring"],
    reviewedAt: "2026-09-01"
  },
  {
    id: "acsm-screening-2015",
    title: "Updating ACSM's Recommendations for Exercise Preparticipation Health Screening",
    organization: "American College of Sports Medicine",
    year: 2015,
    url: "https://journals.lww.com/acsm-msse/fulltext/2015/11000/updating_acsm_s_recommendations_for_exercise.28.aspx",
    supports: ["symptoms-stop-and-seek-guidance", "gradual-return"],
    reviewedAt: "2026-09-01"
  },
  {
    id: "acsm-nutrition-performance-2016",
    title: "Nutrition and Athletic Performance",
    organization: "Academy of Nutrition and Dietetics, Dietitians of Canada and ACSM",
    year: 2016,
    url: "https://pubmed.ncbi.nlm.nih.gov/26920240/",
    supports: ["food-and-fluid-timing", "training-recovery-nutrition", "individualized-nutrition"],
    reviewedAt: "2026-09-01"
  }
];

export function researchSourceById(id) {
  return RESEARCH_SOURCES.find(source => source.id === id) || null;
}
