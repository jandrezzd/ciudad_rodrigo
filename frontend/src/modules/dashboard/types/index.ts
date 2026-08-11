export interface DashboardStats {
  totalDeparturesM3: number;
  totalArrivalsM3: number;
  totalDepartures: number;
  totalArrivals: number;
  totalVehicleExternal: number;
  totalVehicleInternal: number;
  date: string;
  internalVehicleTripsLast30Days?: Record<string, number>;
  externalVehicleTripsLast30Days?: Record<string, number>;
  materialDeliveredLast30Days?: Record<string, number>;
}

export interface DashboardTotalSummary {
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
