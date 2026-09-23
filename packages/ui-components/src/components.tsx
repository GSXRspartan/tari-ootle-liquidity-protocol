import React from 'react';

export interface PoolCardProps {
  pair: string;
  feeTier: number;
  reserveA: string;
  reserveB: string;
  status: string;
  onSelect?: () => void;
}

export const PoolCard: React.FC<PoolCardProps> = ({ pair, feeTier, reserveA, reserveB, status, onSelect }) => {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', margin: '0.5rem 0' }}>
      <h3 style={{ margin: 0 }}>{pair}</h3>
      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#666' }}>
        Fee: {(feeTier / 100).toFixed(2)}% | Status: <strong>{status}</strong>
      </p>
      <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
        Reserves: {reserveA} / {reserveB}
      </p>
      {onSelect && (
        <button onClick={onSelect} style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem' }}>
          View Details
        </button>
      )}
    </div>
  );
};

export interface RouteStatusBadgeProps {
  status: 'TESTED' | 'EXPERIMENTAL' | 'DESIGN_ONLY' | 'BLOCKED' | 'DISABLED';
}

export const RouteStatusBadge: React.FC<RouteStatusBadgeProps> = ({ status }) => {
  const color = status === 'TESTED' ? 'green' : status === 'EXPERIMENTAL' ? 'orange' : status === 'BLOCKED' ? 'red' : '#999';
  return (
    <span style={{ color, fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase' }}>
      {status}
    </span>
  );
};
