import { Navigate, Route, Routes } from 'react-router-dom';
import ShopPage from './pages/ShopPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminShell from './admin/AdminShell.jsx';
import DashboardPage from './admin/DashboardPage.jsx';
import SchedulesPage from './admin/SchedulesPage.jsx';
import SourcesPage from './admin/SourcesPage.jsx';
import CategoriesPage from './admin/CategoriesPage.jsx';
import ProductsPage from './admin/ProductsPage.jsx';
import RunsPage from './admin/RunsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route index element={<ShopPage />} />
      <Route path="product/:id" element={<ProductPage />} />
      {/* Old links looked like /product.html?id=... */}
      <Route path="product.html" element={<ProductPage />} />

      <Route path="admin" element={<AdminShell />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
