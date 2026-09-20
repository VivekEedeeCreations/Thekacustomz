import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute, PublicOnlyRoute } from '@/components/auth/protected-route';
import { LoginPage } from '@/pages/auth/login-page';
import { SignupPage } from '@/pages/auth/signup-page';
import { CategoriesPage } from '@/pages/categories-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { InventoryPage } from '@/pages/inventory/inventory-page';
import { LabelsPage } from '@/pages/labels/labels-page';
import { LocationsPage } from '@/pages/locations-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { OrderDetailPage } from '@/pages/orders/order-detail-page';
import { OrderFormPage } from '@/pages/orders/order-form-page';
import { OrdersPage } from '@/pages/orders/orders-page';
import { ProductFormPage } from '@/pages/products/product-form-page';
import { ProductsListPage } from '@/pages/products/products-list-page';
import { ScanPage } from '@/pages/scan/scan-page';
import { UsersPage } from '@/pages/users-page';
import { VendorsPage } from '@/pages/vendors-page';
import { AdminRoute } from '@/components/auth/admin-route';
import { StaffRoute } from '@/components/auth/staff-route';
import { AppShell } from '@/routes/app-shell';

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'products', element: <ProductsListPage /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:productId', element: <ProductFormPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'orders', element: <OrdersPage /> },
          {
            path: 'orders/new',
            element: <StaffRoute />,
            children: [{ index: true, element: <OrderFormPage /> }],
          },
          { path: 'orders/:orderId', element: <OrderDetailPage /> },
          { path: 'vendors', element: <VendorsPage /> },
          { path: 'locations', element: <LocationsPage /> },
          { path: 'labels', element: <LabelsPage /> },
          {
            path: 'scan',
            element: <StaffRoute />,
            children: [{ index: true, element: <ScanPage /> }],
          },
          {
            path: 'users',
            element: <AdminRoute />,
            children: [{ index: true, element: <UsersPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
