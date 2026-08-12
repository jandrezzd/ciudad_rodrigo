export class DashboardTotalSummaryDto {
  date: string;

  totalDeparturesM3: number;
  totalArrivalsM3: number;
  totalDepartures: number;
  totalArrivals: number;
  totalDeviation: number;

  totalVehicleExternal: number;
  totalVehicleInternal: number;

  totalClients: number;
  totalConstSites: number;
  totalOwners: number;
  totalPlannings: number;

  materialDeliveredByType: Record<string, number>;
}
