import React from 'react';
import './PipelineInfoDisplay.css';

/**
 * 管路情報表示コンポーネント
 * クリックされた管路オブジェクトの情報を表示
 */
function PipelineInfoDisplay({ selectedObject }) {
  if (!selectedObject) return null;

  const { id, type, attributes, geometry } = selectedObject;
  const geom = geometry?.[0];

  return (
    <div className="pipeline-info-display">
      <div className="info-row">
        <span className="info-label">ID:</span>
        <span className="info-value">{id}</span>
      </div>

      <div className="info-row">
        <span className="info-label">タイプ:</span>
        <span className="info-value">{type}</span>
      </div>

      {geom && (
        <div className="info-row">
          <span className="info-label">ジオメトリ:</span>
          <span className="info-value">{geom.type}</span>
        </div>
      )}

      {attributes && Object.entries(attributes).map(([key, value]) => (
        <div className="info-row" key={key}>
          <span className="info-label">{key}:</span>
          <span className="info-value">{value}</span>
        </div>
      ))}

      {geom?.center && (
        <div className="info-row">
          <span className="info-label">位置:</span>
          <span className="info-value">
            X: {geom.center[0].toFixed(2)}, Y: {geom.center[1].toFixed(2)}, Z: {geom.center[2].toFixed(2)}
          </span>
        </div>
      )}

      {geom?.start && (
        <div className="info-row">
          <span className="info-label">開始点:</span>
          <span className="info-value">
            X: {geom.start[0].toFixed(2)}, Y: {geom.start[1].toFixed(2)}, Z: {geom.start[2].toFixed(2)}
          </span>
        </div>
      )}

      {geom?.vertices && geom.vertices[0] && (
        <div className="info-row">
          <span className="info-label">頂点:</span>
          <span className="info-value">
            X: {geom.vertices[0][0].toFixed(2)}, Y: {geom.vertices[0][1].toFixed(2)}, Z: {geom.vertices[0][2].toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

export default PipelineInfoDisplay;

