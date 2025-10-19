import React, { useState, useEffect } from 'react';
import './PipelineInfoDisplay.css';
import PipelineActionButtons from './PipelineActionButtons';

/**
 * 管路情報表示コンポーネント
 * クリックされた管路オブジェクトの情報をテーブル形式で表示
 */
function PipelineInfoDisplay({ 
  selectedObject, 
  shapeTypes,
  onRegister,
  onDuplicate,
  onDelete,
  onAdd,
  onRestore,
  onRestoreAll
}) {
  const [originalValues, setOriginalValues] = useState({}); // 元の値（設定済み）
  const [inputValues, setInputValues] = useState({}); // 入力欄の値
  const [hasChanges, setHasChanges] = useState(false); // 変更があるかどうか
  
  // selectedObjectが変更された時にoriginalValuesとinputValuesを更新
  useEffect(() => {
    if (selectedObject) {
      const { id, feature_id, attributes, geometry, shape_type } = selectedObject;
      const geom = geometry?.[0];

      // shape_typeからshape_type名を取得
      const getShapeTypeName = () => {
        if (!shapeTypes || !shape_type) return '';
        const shapeTypeData = shapeTypes.find(st => String(st.id) === String(shape_type));
        return shapeTypeData ? shapeTypeData.shape_type : '';
      };

      // 管路情報のデータを準備
      const getPipelineData = () => {
        const startPoint = geom?.vertices?.[0];
        const endPoint = geom?.vertices?.[geom.vertices.length - 1];
        const center = geom?.center;
        
        // 長さの計算
        let length = 0;
        if (startPoint && endPoint) {
          length = Math.sqrt(
            Math.pow(endPoint[0] - startPoint[0], 2) +
            Math.pow(endPoint[1] - startPoint[1], 2) +
            Math.pow(endPoint[2] - startPoint[2], 2)
          );
        }

        const pipelineData = {
          形状: getShapeTypeName(),
          識別番号: feature_id || '',
          東西: center ? center[0].toFixed(3) : (startPoint ? startPoint[0].toFixed(3) : ''),
          上被り深さ: center ? (-center[1]).toFixed(3) : (startPoint ? (-startPoint[1]).toFixed(3) : ''),
          南北: center ? center[2].toFixed(3) : (startPoint ? startPoint[2].toFixed(3) : ''),
          直径: attributes?.radius ? (attributes.radius / 1000).toFixed(3) : (attributes?.diameter ? (attributes.diameter / 1000).toFixed(3) : ''),
          長さ: length.toFixed(3),
          端点1東西: startPoint ? startPoint[0].toFixed(3) : '',
          端点1上被り深さ: startPoint ? (-startPoint[1]).toFixed(3) : '',
          端点1南北: startPoint ? startPoint[2].toFixed(3) : '',
          端点2東西: endPoint ? endPoint[0].toFixed(3) : '',
          端点2上被り深さ: endPoint ? (-endPoint[1]).toFixed(3) : '',
          端点2南北: endPoint ? endPoint[2].toFixed(3) : '',
          種別: attributes?.pipe_kind || '',
          材質: attributes?.material || ''
        };
        
        return pipelineData;
      };

      const pipelineData = getPipelineData();
      setOriginalValues(pipelineData); // 元の値を設定
      setInputValues({}); // 入力欄の値を完全にクリア
      setHasChanges(false); // 変更フラグをリセット
    }
  }, [selectedObject, shapeTypes, selectedObject?.geometry]);

  if (!selectedObject) return null;

  // 入力値の変更ハンドラー
  const handleInputChange = (key, value) => {
    setInputValues(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true); // 変更があったことを記録
  };

  // 入力欄のクリックイベントが3Dシーンに伝播しないようにする
  const handleInputClick = (event) => {
    event.stopPropagation();
  };

  // ボタンハンドラー
  const handleRegisterClick = () => {
    if (onRegister) {
      onRegister(selectedObject, inputValues);
      setInputValues({});
      setHasChanges(false);
    }
  };

  const handleDuplicateClick = () => {
    if (onDuplicate) {
      onDuplicate(selectedObject);
    }
  };

  const handleDeleteClick = () => {
    if (onDelete) {
      onDelete(selectedObject);
    }
  };

  const handleAddClick = () => {
    if (onAdd) {
      onAdd();
    }
  };

  const handleRestoreClick = () => {
    if (onRestore) {
      onRestore(selectedObject);
      setInputValues({});
      setHasChanges(false);
    }
  };

  const handleRestoreAllClick = () => {
    if (onRestoreAll) {
      onRestoreAll();
      setInputValues({});
      setHasChanges(false);
    }
  };

  return (
    <div className="pipeline-info-display" onClick={handleInputClick}>
      <table className="pipeline-table">
        <thead>
          <tr>
            <th>[項目]</th>
            <th>[設定済み]</th>
            <th>[入力欄]</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(originalValues).map(([key, value]) => (
            <tr key={key}>
              <td className="item-label">{key}</td>
              <td className="set-value">{value || '-'}</td>
              <td className="input-field">
                <input 
                  type="text" 
                  value={inputValues[key] || ''} 
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  className="pipeline-input"
                  placeholder={value || '入力'}
                  onClick={handleInputClick}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PipelineActionButtons
        onRegister={handleRegisterClick}
        onDuplicate={handleDuplicateClick}
        onDelete={handleDeleteClick}
        onAdd={handleAddClick}
        onRestore={handleRestoreClick}
        onRestoreAll={handleRestoreAllClick}
        hasChanges={hasChanges}
      />
    </div>
  );
}

export default PipelineInfoDisplay;

