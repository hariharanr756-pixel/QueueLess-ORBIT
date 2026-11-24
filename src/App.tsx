import { OrbitProvider, useOrbit } from './context/OrbitContext.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { AuthView } from './components/AuthView.tsx';
import { WorkspaceShell } from './components/WorkspaceShell.tsx';

function AppRouter() {
  const { route, user } = useOrbit();

  if (route === 'workspace' && user) {
    return <WorkspaceShell />;
  }
  if (route === 'auth') {
    return <AuthView />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <OrbitProvider>
      <AppRouter />
    </OrbitProvider>
  );
}
