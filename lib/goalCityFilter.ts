/**
 * Returns a Prisma `where` fragment that limits goals to those visible
 * to a user assigned to `cityId`.
 *
 * Rules:
 *  - cityId = null  → no filter (manager / all-cities view)
 *  - cityId = "x"  → show goals whose geography resolves to city x,
 *                     plus org-wide goals with no geography at all
 */
export function goalCityFilter(cityId: string | null | undefined) {
  if (!cityId) return {}; // no restriction

  return {
    OR: [
      // Org-wide: no geography tagged at all
      {
        needsCityId: null,
        needsZoneId: null,
        needsClusterId: null,
        needsSettlementId: null,
      },
      // City-level goal
      { needsCityId: cityId },
      // Zone-level goal whose zone belongs to this city
      { needsZone: { cityId } },
      // Cluster-level goal whose cluster's zone belongs to this city
      { needsCluster: { zone: { cityId } } },
      // Settlement-level goal whose settlement's cluster's zone belongs to this city
      { needsSettlement: { cluster: { zone: { cityId } } } },
    ],
  };
}
