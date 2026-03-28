import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#222636',
        border: '1px solid #2d3148',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '0.85rem',
      }}>
        <div style={{ color: '#8f93a2', marginBottom: '4px' }}>{label}</div>
        <div style={{ color: '#3b82f6', fontWeight: 600 }}>{payload[0].value} leads</div>
      </div>
    );
  }
  return null;
};

export default function LeadChart({ data = [] }) {
  const chartData = data.length > 0
    ? data.map(d => ({ date: d.date, leads: d.count ?? d.leads ?? 0 }))
    : [{ date: 'Today', leads: 0 }];

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
          <XAxis
            dataKey="date"
            stroke="#8f93a2"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#2d3148' }}
          />
          <YAxis
            stroke="#8f93a2"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#2d3148' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="leads"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
