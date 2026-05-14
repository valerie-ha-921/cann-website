import { useState } from 'react';

interface UnderTheHoodProps {
  equation: string;
  explanation: string;
  code: string;
}

export function UnderTheHood({ equation, explanation, code }: UnderTheHoodProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white/5 hover:bg-white/10 transition-colors text-sm text-slate-400"
      >
        <span className="font-mono">{'<'} Under the hood</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-slate-900/80 space-y-3">
          <div className="text-xs text-slate-400 font-mono bg-slate-800 px-3 py-2 rounded overflow-x-auto whitespace-pre">
            {equation}
          </div>
          <p className="text-xs text-slate-400">{explanation}</p>
          <pre className="text-xs text-green-300 bg-slate-800 px-3 py-2 rounded overflow-x-auto">{code}</pre>
        </div>
      )}
    </div>
  );
}
