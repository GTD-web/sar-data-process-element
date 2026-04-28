'use client';

import { useState } from 'react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import ProductsView from './ProductsView';

export default function ProductsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="products"
      />
      <ProductsView />
    </div>
  );
}
