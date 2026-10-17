import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Driver, Rate, Vehicle, VehicleCategory, Vendor, VendorCategory } from "./types";

/** GET a resource; the path doubles as the cache key. */
export function useApi<T>(path: string | null) {
  return useQuery({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: path != null,
  });
}

/**
 * Wraps a mutation and invalidates every cached query whose path starts with one of
 * the given prefixes (e.g. "/reservations" also refreshes "/reservations/12").
 */
export function useSave<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, invalidate: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[0] ?? "");
          return key.startsWith("/dashboard") || invalidate.some((p) => key.startsWith(p));
        },
      }),
  });
}

// Lookup lists used by many forms.
export const useVehicleCategories = () => useApi<VehicleCategory[]>("/vehicle-categories");
export const useVendorCategories = () => useApi<VendorCategory[]>("/vendor-categories");
export const useVehicles = () => useApi<Vehicle[]>("/vehicles");
export const useDrivers = () => useApi<Driver[]>("/drivers");
export const useRates = () => useApi<Rate[]>("/rates");
export const useVendors = () => useApi<Vendor[]>("/vendors");

export const options = {
  vehicleCategories: (xs?: VehicleCategory[]) => (xs ?? []).map((c) => ({ value: c.id, label: c.name })),
  vehicles: (xs?: Vehicle[]) => (xs ?? []).map((v) => ({ value: v.id, label: `${v.regNumber} — ${v.make} ${v.model}` })),
  drivers: (xs?: Driver[]) => (xs ?? []).map((d) => ({ value: d.id, label: d.fullName })),
  vendors: (xs?: Vendor[]) => (xs ?? []).map((v) => ({ value: v.id, label: v.name })),
  vendorCategories: (xs?: VendorCategory[]) => (xs ?? []).map((c) => ({ value: c.id, label: c.name })),
};
