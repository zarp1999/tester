import React from 'react';
import './PipelineActionButtons.css';

/**
 * 管路アクションボタンコンポーネント
 * 管路情報表示の下に表示される操作ボタン群
 */
function PipelineActionButtons({ 
  onRegister, 
  onDuplicate, 
  onDelete, 
  onAdd,
  onRestore, 
  onRestoreAll,
  hasChanges = false
}) {
  // クリックイベントの伝播を止める
  const handleContainerClick = (event) => {
    event.stopPropagation();
  };

  // ボタンクリックハンドラー（イベント伝播を確実に止める）
  const handleButtonClick = (callback) => (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (callback) {
      callback(event);
    }
  };

  return (
    <div className="pipeline-action-buttons" onClick={handleContainerClick}>
      <div className="button-row">
        <button 
          className="action-btn btn-register" 
          onClick={handleButtonClick(onRegister)}
          title="変更内容をサーバーに保存"
        >
          登録
        </button>
        <button 
          className="action-btn btn-duplicate" 
          onClick={handleButtonClick(onDuplicate)}
          title="選択中の管路を複製"
        >
          複製
        </button>
        <button 
          className="action-btn btn-delete" 
          onClick={handleButtonClick(onDelete)}
          title="選択中の管路を削除"
        >
          削除
        </button>
      </div>
      <div className="button-row">
        <button 
          className="action-btn btn-add" 
          onClick={handleButtonClick(onAdd)}
          title="新しい管路を追加（未実装）"
        >
          追加
        </button>
        <button 
          className="action-btn btn-restore" 
          onClick={handleButtonClick(onRestore)}
          title="選択中の管路を元に戻す"
        >
          復元
        </button>
        <button 
          className="action-btn btn-restore-all" 
          onClick={handleButtonClick(onRestoreAll)}
          title="すべての管路を元に戻す"
        >
          全て復元
        </button>
      </div>
    </div>
  );
}

export default PipelineActionButtons;

