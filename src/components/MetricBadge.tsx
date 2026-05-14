interface MetricBadgeProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}

const colorMap = {
  blue:   'bg-blue-900/40 border-blue-700 text-blue-300',
  green:  'bg-green-900/40 border-green-700 text-green-300',
  amber:  'bg-amber-900/40 border-amber-700 text-amber-300',
  red:    'bg-red-900/40 border-red-700 text-red-300',
  purple: 'bg-purple-900/40 border-purple-700 text-purple-300',
};

export function MetricBadge({ label, value, unit, highlight, color = 'blue' }: MetricBadgeProps) {
  const cls = colorMap[color];
  return (
    <div className={`border rounded-lg px-3 py-2 text-center min-w-[90px] transition-all ${cls} ${highlight ? 'ring-2 ring-white/20' : ''}`}>
      <div className="text-xs uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
      <div className="text-lg font-mono font-semibold leading-none">
        {typeof value === 'number' ? value.toFixed(2) : value}
        {unit && <span className="text-xs ml-1 text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}
