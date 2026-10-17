/** Shapes returned by the crpro API. Decimal columns arrive as strings. */

export type Decimal = string | number;
export type Role = "ADMIN" | "STAFF";
export type ReservationStatus = "PENDING" | "IN_PROGRESS" | "CLOSED" | "CANCELLED";
export type Source = "IN_HOUSE" | "THIRD_PARTY";
export type POStatus = "PENDING" | "APPROVED" | "RECEIVED" | "CANCELLED";

export type AuthUser = { id: number; username: string; fullName: string; role: Role };

export type User = AuthUser & {
  designation: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
};

export type VehicleCategory = { id: number; code: string; name: string };
export type VendorCategory = { id: number; name: string };

export type Vehicle = {
  id: number;
  regNumber: string;
  make: string;
  model: string;
  categoryId: number | null;
  category: VehicleCategory | null;
  year: number | null;
  country: string | null;
  colour: string | null;
  tyreSize: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  transmission: string | null;
  roadworthyExpiry: string | null;
  insuranceExpiry: string | null;
  nextServiceDate: string | null;
  nextServiceOdometer: number | null;
  active: boolean;
};

export type Driver = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  licenceClass: string | null;
  designation: string | null;
  inService: boolean;
  _count: { reservations: number };
};

export type Rate = {
  id: number;
  code: string;
  category: string;
  description: string;
  vehicleUsd: Decimal;
  levyUsd: Decimal;
  vatUsd: Decimal;
  getFundLevyUsd: Decimal;
  driverAllowanceUsd: Decimal;
  fuelUsd: Decimal;
  subtotalUsd: number;
  totalUsd: number;
  active: boolean;
};

export type Reservation = {
  id: number;
  companyName: string;
  contactName: string;
  contactPhone: string;
  vehicleCategoryId: number | null;
  vehicleCategory: VehicleCategory | null;
  startDate: string;
  endDate: string;
  days: number;
  destination: string;
  remarks: string | null;
  status: ReservationStatus;
  source: Source | null;
  driverId: number | null;
  vehicleId: number | null;
  externalDriver: string | null;
  externalVehicle: string | null;
  rateId: number | null;
  rate: Rate | null;
  driverName: string | null;
  vehicleReg: string | null;
  estimatedTotalUsd: number | null;
  createdBy: { id: number; fullName: string; username: string } | null;
  createdAt: string;
};

export type Vendor = {
  id: number;
  name: string;
  categoryId: number | null;
  category: VendorCategory | null;
  contactPerson: string | null;
  address: string | null;
  phone: string | null;
  paymentType: string | null;
  creditTermDays: number | null;
};

export type LineItem = { id?: number; description: string; quantity: Decimal; unitPrice: Decimal; total?: number };

export type PurchaseOrder = {
  id: number;
  number: string;
  orderDate: string;
  dueDate: string | null;
  vendorId: number;
  vendor: Vendor;
  vehicleId: number | null;
  vehicle: { id: number; regNumber: string } | null;
  status: POStatus;
  notes: string | null;
  createdBy: { id: number; fullName: string } | null;
  items: (LineItem & { unit: string | null })[];
  total: number;
};

export type Invoice = {
  id: number;
  number: string;
  invoiceDate: string;
  customerName: string;
  customerAddress: string | null;
  usdToGhs: Decimal | null;
  amountPaid: Decimal;
  notes: string | null;
  createdBy: { id: number; fullName: string } | null;
  items: (LineItem & { rateId: number | null; reservationId: number | null })[];
  totalUsd: number;
  amountDueUsd: number;
  totalGhs: number | null;
};

export type ServiceRecord = {
  id: number;
  vehicleId: number;
  vehicle: { id: number; regNumber: string; make: string; model: string };
  serviceDate: string;
  odometer: number | null;
  garage: string;
  garageLocation: string | null;
  driverId: number | null;
  driver: { id: number; firstName: string; lastName: string } | null;
  details: string | null;
  amount: Decimal;
  createdBy: { id: number; fullName: string } | null;
};

export type ExchangeRate = {
  id: number;
  effectiveDate: string;
  usdToGhs: Decimal;
  createdBy: { fullName: string } | null;
};
