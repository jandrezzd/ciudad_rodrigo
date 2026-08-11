export class DashboardStatsDto {

  totalDeparturesM3: number; 
  totalArrivalsM3: number; 
  totalDepartures: number; 
  totalArrivals: number; 

  totalVehicleExternal: number; 
  totalVehicleInternal: number; 

  date: string;

  internalVehicleTripsLast30Days: Record<string, number>;
  externalVehicleTripsLast30Days: Record<string, number>;
  materialDeliveredLast30Days: Record<string, number>;
}
