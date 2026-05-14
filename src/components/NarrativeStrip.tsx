interface NarrativeStripProps {
  moduleNum: number;
  question: string;
  subtitle?: string;
}

const moduleColors = [
  'from-blue-900/60 to-slate-900',
  'from-indigo-900/60 to-slate-900',
  'from-violet-900/60 to-slate-900',
  'from-purple-900/60 to-slate-900',
];

const moduleLabels = [
  'Module 1 · ODR Task',
  'Module 2 · Ring Network',
  'Module 3 · Attractor Canyon',
  'Module 4 · Noise → Error',
];

export function NarrativeStrip({ moduleNum, question, subtitle }: NarrativeStripProps) {
  const grad = moduleColors[moduleNum - 1] ?? moduleColors[0];
  const label = moduleLabels[moduleNum - 1] ?? '';

  return (
    <div className={`w-full bg-gradient-to-r ${grad} border-b border-white/10 px-8 py-5`}>
      <div className="flex items-start gap-4 max-w-5xl mx-auto">
        <div className="flex-shrink-0 mt-0.5">
          <span className="inline-block bg-white/10 text-white/60 text-xs font-mono px-2 py-0.5 rounded">
            {label}
          </span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white leading-snug">{question}</h2>
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
