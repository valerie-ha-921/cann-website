import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Module1ODR } from './components/Module1ODR';
import { Module2Ring } from './components/Module2Ring';
import { Module3Canyon } from './components/Module3Canyon';
import { Module4Error } from './components/Module4Error';
import { useNetworkStore } from './store/networkStore';

const MODULE_LABELS = [
  { n: 1, short: 'ODR Task', icon: '◎' },
  { n: 2, short: 'Ring Network', icon: '⬤' },
  { n: 3, short: 'Canyon', icon: '⌒' },
  { n: 4, short: 'Noise → Error', icon: '∿' },
];

function ModuleNav({
  current,
  onSelect,
  onBackToLanding,
}: {
  current: number;
  onSelect: (n: number) => void;
  onBackToLanding: () => void;
}) {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-slate-950 shrink-0">
      <button
        onClick={onBackToLanding}
        className="text-xs font-mono text-slate-600 hover:text-slate-400 mr-3 transition-colors"
        title="Back to introduction"
      >
        ← Intro
      </button>

      {MODULE_LABELS.map(({ n, short, icon }, idx) => (
        <div key={n} className="flex items-center">
          {idx > 0 && <span className="text-slate-700 mx-1 text-xs">→</span>}
          <button
            onClick={() => onSelect(n)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              current === n
                ? 'bg-blue-900/50 text-blue-300 border border-blue-800'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="opacity-70">{icon}</span>
            {short}
          </button>
        </div>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => useNetworkStore.getState().resetExperiment()}
        className="text-xs text-slate-600 hover:text-slate-400 px-2 py-1 rounded hover:bg-slate-800 transition-colors font-mono"
        title="Reset entire experiment"
      >
        ↺ Reset
      </button>
    </nav>
  );
}

function MainApp({ onBackToLanding }: { onBackToLanding: () => void }) {
  const [module, setModule] = useState(1);
  const { goToModule, resetExperiment } = useNetworkStore();

  const go = (n: number) => {
    setModule(n);
    goToModule(n);
  };

  const handleRestart = () => {
    resetExperiment();
    go(1);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <ModuleNav current={module} onSelect={go} onBackToLanding={onBackToLanding} />
      <main className="flex-1 overflow-hidden">
        {module === 1 && <Module1ODR onContinue={() => go(2)} />}
        {module === 2 && <Module2Ring onContinue={() => go(3)} />}
        {module === 3 && <Module3Canyon onContinue={() => go(4)} />}
        {module === 4 && <Module4Error onRestart={handleRestart} />}
      </main>
    </div>
  );
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return <MainApp onBackToLanding={() => setShowLanding(true)} />;
}
