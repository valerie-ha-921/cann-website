interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  description?: string;
}

export function SliderControl({
  label, value, min, max, step, onChange, formatValue, description
}: SliderControlProps) {
  const display = formatValue ? formatValue(value) : value.toFixed(2);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label className="text-sm text-slate-300 font-medium">{label}</label>
        <span className="text-sm font-mono text-blue-300">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-blue-400 cursor-pointer"
      />
      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}
    </div>
  );
}
