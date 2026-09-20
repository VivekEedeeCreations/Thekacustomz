import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  MapPin,
  Package,
  ScanLine,
  ShoppingCart,
  Tag,
  Tags,
  Truck,
  UsersRound,
  Warehouse,
} from 'lucide-react';
import type { UserRole } from '@inventory/shared';

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  minRole: UserRole;
}

export const NAV_ITEMS: NavItem[] = [
  { title: 'Dashboard', to: '/', icon: LayoutDashboard, minRole: 'VIEWER' },
  { title: 'Products', to: '/products', icon: Package, minRole: 'VIEWER' },
  { title: 'Categories', to: '/categories', icon: Tags, minRole: 'VIEWER' },
  { title: 'Inventory', to: '/inventory', icon: Warehouse, minRole: 'VIEWER' },
  { title: 'Orders', to: '/orders', icon: ShoppingCart, minRole: 'VIEWER' },
  { title: 'Scan', to: '/scan', icon: ScanLine, minRole: 'STAFF' },
  { title: 'Vendors', to: '/vendors', icon: Truck, minRole: 'VIEWER' },
  { title: 'Locations', to: '/locations', icon: MapPin, minRole: 'VIEWER' },
  { title: 'Labels', to: '/labels', icon: Tag, minRole: 'STAFF' },
  { title: 'Users', to: '/users', icon: UsersRound, minRole: 'ADMIN' },
];
