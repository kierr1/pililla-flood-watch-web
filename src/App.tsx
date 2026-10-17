import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminRoute } from "@/components/auth/RouteGuards";
import MissionShell from "@/components/layout/MissionShell";
import AlertScreenOverlay from "@/components/layout/AlertScreenOverlay";
import Dashboard from "./pages/Dashboard";
import GIS from "./pages/GIS";
import Evacuation from "./pages/Evacuation";
import Weather from "./pages/Weather";
import ML from "./pages/ML";
import Centers from "./pages/Centers";
import Alerts from "./pages/Alerts";
import Admin from "./pages/Admin";
import AdminUsers from "./pages/AdminUsers";
import Analytics from "./pages/Analytics";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AlertScreenOverlay />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<MissionShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/gis" element={<GIS />} />
              <Route path="/evacuation" element={<Evacuation />} />
              <Route path="/weather" element={<Weather />} />
              <Route path="/ml" element={<ML />} />
              <Route path="/centers" element={<Centers />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/analytics" element={<Analytics />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
