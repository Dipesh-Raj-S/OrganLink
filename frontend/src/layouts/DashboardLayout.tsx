import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';

export const DashboardLayout: React.FC = () => {
  const [navOpen, setNavOpen] = React.useState(false);
  const location = useLocation();

  // Close the mobile navigation drawer whenever the route changes.
  React.useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-page text-slate-800 flex flex-col">
      <Navbar onToggleSidebar={() => setNavOpen((v) => !v)} />
      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:block shrink-0">
          <Sidebar />
        </div>

        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <div
              className="absolute inset-0 bg-navy-darker/50"
              onClick={() => setNavOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex shadow-xl">
              <Sidebar />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-page p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
