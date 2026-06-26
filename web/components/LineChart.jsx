export default function LineChart({ series = [], metric = 'totalValue' }) {
  const width = 360;
  const height = 180;
  const pad = 18;
  const values = series.map((item) => Number(item[metric] ?? item.totalValue ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = series.map((item, index) => {
    const x = series.length === 1 ? width / 2 : pad + (index / Math.max(series.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - (Number(item[metric] ?? item.totalValue ?? 0) - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = points.length ? `${pad},${height - pad} ${points.join(' ')} ${width - pad},${height - pad}` : '';

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="连续资产曲线">
      <polyline className="chart-area" points={area} />
      <polyline className="chart-line" points={points.join(' ')} />
      {points.map((point) => {
        const [cx, cy] = point.split(',');
        return <circle key={point} cx={cx} cy={cy} r="3" fill="#2BD9FF" />;
      })}
    </svg>
  );
}

