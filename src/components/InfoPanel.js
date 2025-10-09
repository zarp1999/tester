import React from 'react';
import './InfoPanel.css';

function InfoPanel({ object, onClose }) {
  if (!object) return null;

  const { id, type, attributes, color } = object;

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <h3>オブジェクト情報</h3>
        <button className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="info-panel-content">
        <div className="info-section">
          <div className="info-item">
            <span className="info-label">ID:</span>
            <span className="info-value">{id}</span>
          </div>

          <div className="info-item">
            <span className="info-label">形状:</span>
            <span className="info-value">
              {type === 'cylinder' && '円筒形 🔧'}
              {type === 'sphere' && '球形 ⚫'}
              {type === 'box' && '直方体 📦'}
            </span>
          </div>

          <div className="info-item">
            <span className="info-label">色:</span>
            <span 
              className="color-swatch"
              style={{ backgroundColor: color }}
            ></span>
            <span className="info-value">{color}</span>
          </div>
        </div>

        {attributes && (
          <div className="info-section">
            <h4>付帯情報</h4>
            {Object.entries(attributes).map(([key, value]) => (
              <div className="info-item" key={key}>
                <span className="info-label">{key}:</span>
                <span className="info-value">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="info-section">
          <h4>座標情報</h4>
          <div className="info-item">
            <span className="info-label">位置:</span>
            <span className="info-value">
              X: {object.position[0].toFixed(2)}, 
              Y: {object.position[1].toFixed(2)}, 
              Z: {object.position[2].toFixed(2)}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">スケール:</span>
            <span className="info-value">
              X: {object.scale[0].toFixed(2)}, 
              Y: {object.scale[1].toFixed(2)}, 
              Z: {object.scale[2].toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoPanel;

