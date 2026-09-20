import type { MovementType } from '@inventory/shared';

/** Movement types where "which vendor did this come from" is meaningful. */
export const VENDOR_RELEVANT_MOVEMENT_TYPES: readonly MovementType[] = [
  'PURCHASE',
  'INITIAL_STOCK',
  'RETURN',
];

/** Movement types that must not be recorded without a vendor. */
export const VENDOR_REQUIRED_MOVEMENT_TYPES: readonly MovementType[] = ['PURCHASE'];

export function isVendorRelevant(type: MovementType): boolean {
  return VENDOR_RELEVANT_MOVEMENT_TYPES.includes(type);
}

export function isVendorRequired(type: MovementType): boolean {
  return VENDOR_REQUIRED_MOVEMENT_TYPES.includes(type);
}
