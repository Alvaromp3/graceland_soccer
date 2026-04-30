interface MetricBlockProps {
  value: string | number;
  label: string;
  sublabel?: string;
  className?: string;
  valueClassName?: string;
}

export default function MetricBlock({
  value,
  label,
  sublabel,
  className = '',
  valueClassName = '',
}: MetricBlockProps) {
  return (
    <div className={`panel--metric ${className}`}>
      <p className={`metric-value ${valueClassName}`}>{value}</p>
      <p className="metric-label mt-1">{label}</p>
      {sublabel && <p className="caption mt-0.5">{sublabel}</p>}
    </div>
  );
}
