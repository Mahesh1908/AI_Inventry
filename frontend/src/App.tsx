import { NavLink, Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import SubmitOrder from './pages/SubmitOrder';
import FulfilmentLookup from './pages/FulfilmentLookup';
import OrdersList from './pages/OrdersList';
import InventoryView from './pages/InventoryView';

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="app-header">
          <h1>Cement Order Fulfilment &amp; Inventory</h1>
          <nav>
            <NavLink to="/submit">Submit Order</NavLink>
            <NavLink to="/lookup">Fulfilment Lookup</NavLink>
            <NavLink to="/orders">Orders List</NavLink>
            <NavLink to="/inventory">Inventory View</NavLink>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/submit" replace />} />
            <Route path="/submit" element={<SubmitOrder />} />
            <Route path="/lookup" element={<FulfilmentLookup />} />
            <Route path="/orders" element={<OrdersList />} />
            <Route path="/inventory" element={<InventoryView />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
