export interface Driver {
  id: number;
  name?: string | null;
  document?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface DriverFormData {
  name: string;
  document: string;
  phone: string;
}
