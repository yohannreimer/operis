export const chartTheme = {
  colors: {
    primary: '#e07c4a',
    success: '#5bb98c',
    warning: '#d4a843',
    danger: '#d46464',
    muted: '#6b6560',
    secondary: '#a09a92'
  },
  palette: ['#e07c4a', '#5bb98c', '#d4a843', '#d46464', '#7b9ec9', '#b87bb5'],
  grid: 'rgba(255,255,255,0.05)',
  axis: {
    fill: '#6b6560',
    stroke: 'rgba(255,255,255,0.06)'
  },
  tooltip: {
    bg: '#2f2f36',
    border: 'rgba(255,255,255,0.08)',
    color: '#e8e4df',
    radius: 8
  },
  dot: {
    fill: '#e07c4a',
    stroke: '#1a1a1e',
    strokeWidth: 2
  }
};

export const tooltipStyle = {
  contentStyle: {
    background: chartTheme.tooltip.bg,
    border: `1px solid ${chartTheme.tooltip.border}`,
    borderRadius: chartTheme.tooltip.radius,
    color: chartTheme.tooltip.color,
    fontSize: '0.82rem'
  },
  labelStyle: {
    color: chartTheme.axis.fill,
    fontSize: '0.75rem'
  },
  itemStyle: {
    color: chartTheme.tooltip.color
  }
};

export const cartesianGridProps = {
  stroke: chartTheme.grid,
  strokeDasharray: '3 3'
};

export const axisProps = {
  tick: { fill: chartTheme.axis.fill, fontSize: 11 },
  axisLine: { stroke: chartTheme.axis.stroke },
  tickLine: { stroke: chartTheme.axis.stroke }
};
