import React, { useState } from 'react';
import './LayerControl.css';

function LayerControl({ layers, visibleLayers, onLayerToggle }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={`layer-control ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="layer-control-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>
          <span className="icon">📊</span>
          レイヤー制御
        </h3>
        <button className="toggle-button">
          {isExpanded ? '◀' : '▶'}
        </button>
      </div>

      {isExpanded && (
        <div className="layer-control-content">
          <p className="layer-control-description">
            表示するレイヤーを選択してください
          </p>

          <div className="layer-list">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className={`layer-item ${visibleLayers[layer.id] ? 'active' : 'inactive'}`}
                onClick={() => onLayerToggle(layer.id)}
              >
                <div className="layer-info">
                  <span className="layer-icon">{layer.icon}</span>
                  <span className="layer-name">{layer.name}</span>
                </div>
                
                <div className="layer-controls">
                  <span
                    className="layer-color-indicator"
                    style={{ backgroundColor: layer.color }}
                  ></span>
                  
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={visibleLayers[layer.id] || false}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="layer-control-footer">
            <button
              className="layer-button"
              onClick={() => {
                layers.forEach(layer => {
                  if (!visibleLayers[layer.id]) {
                    onLayerToggle(layer.id);
                  }
                });
              }}
            >
              全て表示
            </button>
            <button
              className="layer-button"
              onClick={() => {
                layers.forEach(layer => {
                  if (visibleLayers[layer.id]) {
                    onLayerToggle(layer.id);
                  }
                });
              }}
            >
              全て非表示
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LayerControl;

