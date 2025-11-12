import React, { useRef, useEffect, useState, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SkyComponent from './SkyComponent';
import PipelineInfoDisplay from './PipelineInfoDisplay';
import { DistanceMeasurement, DistanceMeasurementDisplay } from './DistanceMeasurement';
import CrossSectionPlane from './CrossSectionPlane';
import './Scene3D.css';

/**
 * 3Dシーンコンポーネント
 * - CityJSONの内容からオブジェクトを生成
 * - キー/マウスによるカメラ操作
 * - 左上: 管路情報、左下: カメラ情報
 */
const Scene3D = React.forwardRef(function Scene3D({ cityJsonData, userPositions, shapeTypes, layerData, sourceTypes, hideInfoPanel = false, hideBackground = false, enableCrossSectionMode = false, autoModeEnabled = false, onMeasurementUpdate = null, onSelectedObjectChange = null, generatedSections = [], sectionViewMode = false, currentSectionIndex = 0 }, ref) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const hoveredObjectRef = useRef(null);
  const selectedMeshRef = useRef(null);
  const keysPressed = useRef({});
  const controlsRef = useRef(null);
  const floorRef = useRef(null);
  const skyComponentRef = useRef(null);
  const crossSectionRef = useRef(null);
  const initialCameraPosition = useRef(new THREE.Vector3(20, 20, 20));
  const initialCameraRotation = useRef(new THREE.Euler());
  const centerPosition = useRef(new THREE.Vector3(0, 0, 0));
  const previousCameraPosition = useRef(new THREE.Vector3(20, 20, 20));
  const previousCameraRotation = useRef(new THREE.Euler());

  // アウトライン表示用のref（EdgesGeometry方式）
  const outlineHelperRef = useRef(null);
  
  // 断面自動作成モードの状態をrefで保持（クリックハンドラーで最新の値を参照するため）
  const autoModeEnabledRef = useRef(autoModeEnabled);

  // 生成された断面マーカーのref
  const generatedSectionMarkersRef = useRef([]);

  // ドラッグ機能用のref
  const isDragging = useRef(false);
  const dragStartPosition = useRef(new THREE.Vector3());
  const dragPlane = useRef(new THREE.Plane());
  const dragIntersection = useRef(new THREE.Vector3());

  // 距離計測用のref
  const distanceMeasurementRef = useRef(null);

  // マウス移動フラグ（パフォーマンス最適化用）
  const mouseMovedRef = useRef(false);

  // カメラ位置情報のstate
  const [cameraInfo, setCameraInfo] = useState({
    x: 20.0,
    y: 20.0,
    z: 20.0,
    roll: 0.0,
    pitch: 0.0,
    yaw: 0.0
  });

  // 選択されたオブジェクトのstate
  const [selectedObject, setSelectedObject] = useState(null);
  const [showGuides, setShowGuides] = useState(true);
  const [showPipes, setShowPipes] = useState(true);
  const [showFloor, setShowFloor] = useState(true);
  const [showBackground, setShowBackground] = useState(!hideBackground);

  // 距離計測結果のstate
  const [measurementResult, setMeasurementResult] = useState(null);

  // showPipes が変更されたときに管路オブジェクトの表示/非表示を切り替え
  useEffect(() => {
    if (!objectsRef.current) return;

    // 全ての管路オブジェクトのvisibleプロパティを更新
    Object.values(objectsRef.current).forEach(obj => {
      if (obj && obj.type === 'Mesh') {
        obj.visible = showPipes;
      }
    });
  }, [showPipes]);

  // 距離計測結果が更新されたときに親コンポーネントに通知
  useEffect(() => {
    if (onMeasurementUpdate) {
      onMeasurementUpdate(measurementResult);
    }
  }, [measurementResult, onMeasurementUpdate]);

  // オブジェクトの元データを保存（復元機能用）
  const originalObjectsData = useRef({});

  // 3Dオブジェクトの作成（shape/color対応）
  /**
   * CityJSONオブジェクトからThree.jsメッシュを生成する。
   */
  const createCityObject = (obj, shapeTypeMap, styleMap, sourceTypeMap, materialVisibilityMap, materialValStyleMap, pipeKindValStyleMap) => {
    let geometry;
    const geom = obj.geometry?.[0];
    if (!geom) return null;

    // shape_type名（無ければ CityJSON の geometry.type）
    const shapeTypeName = shapeTypeMap?.[String(obj.shape_type)] || geom.type;

    // 色スタイルを決定
    const style = getPipeColorStyle(obj, styleMap, sourceTypeMap, materialValStyleMap, pipeKindValStyleMap);
    const colorHex = style?.color || '#888888';
    const opacity = style?.alpha ?? 1;
    // material 値と layer_panel.json の val を比較して初期表示を決定
    const initialVisible = (() => {
      const materialVal = obj?.attributes?.material;
      if (materialVal == null) return true;
      const map = materialVisibilityMap || {};
      if (Object.prototype.hasOwnProperty.call(map, materialVal)) {
        return map[materialVal];
      }
      return true;
    })();

    // LineString系の処理を統合（Cylinder + LineString と LineString）
    if ((shapeTypeName === 'Cylinder' && geom.type === 'LineString') || shapeTypeName === 'LineString' || shapeTypeName === 'MultiCylinder') {
      if (Array.isArray(geom.vertices) && geom.vertices.length >= 2) {
        // 始点と終点を使用してCylinderGeometryを作成
        const start = geom.vertices[0];
        const end = geom.vertices[geom.vertices.length - 1];

        // 座標変換（深度属性がある場合）
        const hasDepthAttrs = (
          obj.attributes &&
          obj.attributes.start_point_depth != null &&
          obj.attributes.end_point_depth != null &&
          Number.isFinite(Number(obj.attributes.start_point_depth)) &&
          Number.isFinite(Number(obj.attributes.end_point_depth))
        );

        // 半径を先に計算
        let radius;
        if (shapeTypeName === 'Cylinder' || shapeTypeName === 'MultiCylinder') {
          radius = (obj.attributes?.radius != null) ? Number(obj.attributes.radius) : 0;
          if (radius > 5) radius = radius / 1000;
          radius = Math.max(radius, 0.05);
        } else {
          radius = 0.05;
        }
        let startPoint, endPoint;
        if (hasDepthAttrs) {
          const startDepth = Number(obj.attributes.start_point_depth / 100);
          const endDepth = Number(obj.attributes.end_point_depth / 100);
          const startCenterY = startDepth > 0 ? -(startDepth + radius) : startDepth;
          const endCenterY = endDepth > 0 ? -(endDepth + radius) : endDepth;
          startPoint = new THREE.Vector3(start[1], startCenterY, start[0]);
          endPoint = new THREE.Vector3(end[1], endCenterY, end[0]);
        } else {
          startPoint = new THREE.Vector3(start[1], start[2] + radius, start[0]);
          endPoint = new THREE.Vector3(end[1], end[2] + radius, end[0]);
        }

        // 円柱の高さを計算
        const height = startPoint.distanceTo(endPoint);
        geometry = new THREE.CylinderGeometry(radius, radius, height, 24);
      } else {
        // 頂点が不足している場合は簡易表示
        geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      }
    } else {
      // 既存のタイプに基づいてThree.jsオブジェクトを作成
      switch (shapeTypeName) {
        case 'Point':
        case 'MultiPoint':
          geometry = new THREE.SphereGeometry(0.2, 16, 16);
          break;
        case 'LineString':
          // LineStringは上記の統合処理で処理されるため、ここでは何もしない
          break;
        case 'MultiLineString':
        case 'Arc':
        case 'Spline':
        // 簡易表示
          geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
          break;
        case 'Circle':
          geometry = new THREE.SphereGeometry(geom.radius || 0.5, 32, 32);
          break;
        case 'Sphere':
          geometry = new THREE.SphereGeometry(geom.radius || 0.5, 32, 32);
          break;
        case 'Cylinder':
          // Cylinderは上記の統合処理で処理されるため、ここでは何もしない
          break;
        case 'Box':
        case 'Rectangle':
        case 'Cube': {
          const w = geom.width || geom.size || 1;
          const h = geom.height || geom.size || 1;
          const d = geom.depth || geom.size || 1;
          geometry = new THREE.BoxGeometry(w, h, d);
          break;
        }
        case 'Cone':
          geometry = new THREE.ConeGeometry(geom.base_radius || 0.5, 1, 32);
          break;
        case 'Torus':
          geometry = new THREE.TorusGeometry(geom.major_radius || 0.6, geom.minor_radius || 0.2, 16, 100);
          break;
        default:
          geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      }
    }

    const material = hideBackground
      ? new THREE.MeshLambertMaterial({
        color: colorHex,
        transparent: opacity < 1,
        opacity,
        flatShading: true,  // フラットシェーディングで断面図らしく
        emissive: new THREE.Color(colorHex).multiplyScalar(0.2),  // 少し自己発光させて見やすく
        emissiveIntensity: 0.3
      })
      : new THREE.MeshStandardMaterial({
        color: colorHex,
        metalness: 0.6,
        roughness: 0.4,
        transparent: opacity < 1,
        opacity,

        emissive: new THREE.Color(colorHex).multiplyScalar(0.1),
        emissiveIntensity: 0.05
      });

    const mesh = new THREE.Mesh(geometry, material);

    // 位置設定：LineString系の統合処理
    if ((shapeTypeName === 'Cylinder' && geom.type === 'LineString') || shapeTypeName === 'LineString' || shapeTypeName === 'MultiCylinder') {
      if (Array.isArray(geom.vertices) && geom.vertices.length >= 2) {
        // LineString系の位置設定
        const start = geom.vertices[0];
        const end = geom.vertices[geom.vertices.length - 1];
        const hasDepthAttrs = (
          obj.attributes &&
          obj.attributes.start_point_depth != null &&
          obj.attributes.end_point_depth != null &&
          Number.isFinite(Number(obj.attributes.start_point_depth)) &&
          Number.isFinite(Number(obj.attributes.end_point_depth))
        );

        // 半径を先に計算
        let radius;
        if (shapeTypeName === 'Cylinder' || shapeTypeName === 'MultiCylinder') {
          radius = (obj.attributes?.radius != null) ? Number(obj.attributes.radius) : 0;
          if (radius > 5) radius = radius / 1000;
          radius = Math.max(radius, 0.05);
        } else {
          radius = 0.05;
        }

        let startPoint, endPoint;
        if (hasDepthAttrs) {
          const startDepth = Number(obj.attributes.start_point_depth / 100);
          const endDepth = Number(obj.attributes.end_point_depth / 100);
          const startCenterY = startDepth > 0 ? -(startDepth + radius) : startDepth;
          const endCenterY = endDepth > 0 ? -(endDepth + radius) : endDepth;
          startPoint = new THREE.Vector3(start[1], startCenterY, start[0]);
          endPoint = new THREE.Vector3(end[1], endCenterY, end[0]);
        } else {
          startPoint = new THREE.Vector3(start[1], start[2] + radius, start[0]);
          endPoint = new THREE.Vector3(end[1], end[2] + radius, end[0]);
        }
        const direction = endPoint.clone().sub(startPoint).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        mesh.setRotationFromQuaternion(quaternion);
        const center = startPoint.clone().add(endPoint).multiplyScalar(0.5);
        mesh.position.copy(center);
      }
    } else {
      const center = geom.center || geom.start || geom.vertices?.[0] || [0, 0, 0];
      mesh.position.set(center[1], center[2], center[0]);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { objectData: obj, originalColor: colorHex };
    mesh.visible = initialVisible;

    return mesh;
  };

  // "POINT (x y)" を { x, y } に変換
  const parsePointWkt = (wkt) => {
    if (!wkt || typeof wkt !== 'string') return null;
    const match = /POINT\s*\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s*\)/i.exec(wkt);
    if (!match) return null;
    return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
  };

  // shape_type.json -> { id: shape_type }
  const buildShapeTypeMap = (shapeTypesArr) => {
    const map = {};
    (shapeTypesArr || []).forEach(({ id, shape_type }) => {
      map[String(id)] = shape_type;
    });
    return map;
  };

  // source_types.json -> { id: source_type }
  const buildSourceTypeMap = (sourceTypesArr) => {
    const map = {};
    (sourceTypesArr || []).forEach(({ id, source_type }) => {
      map[String(id)] = source_type;
    });
    return map;
  };

  // layer_panel.json -> { discr_class: { attribute: { val: { color, alpha } } } }
  const buildStyleMap = (layerPanelArr) => {
    const styles = {};
    (layerPanelArr || []).forEach(entry => {
      const discr = entry.discr_class;
      const attr = entry.attribute;
      const val = entry.val;
      const color = entry.color;
      const alpha = entry.alpha ?? 1;
      if (!discr || !attr || !val || !color) return;
      styles[discr] = styles[discr] || {};
      styles[discr][attr] = styles[discr][attr] || {};
      styles[discr][attr][val] = { color: `#${color}`, alpha };
    });
    return styles;
  };

  // layer_panel.json -> attribute 単位（'material' or 'pipe_kind'）で val 直引きのスタイルマップ
  const buildValStyleMap = (layerPanelArr, targetAttr) => {
    const map = {};
    (layerPanelArr || []).forEach(entry => {
      if (entry?.attribute !== targetAttr) return;
      const val = entry?.val;
      const color = entry?.color;
      const alpha = entry?.alpha ?? 1;
      if (val == null || !color) return;
      // 後勝ち/上書き
      map[val] = { color: `#${color}`, alpha };
    });
    return map;
  };

  // 色解決: source_type_id -> source_type -> layer_panel で属性一致の色
  const getPipeColorStyle = (obj, styleMap, sourceTypeMap, materialValStyleMap, pipeKindValStyleMap) => {
    const attrs = obj?.attributes || {};
    const pipeVal = attrs.pipe_kind;
    const matVal = attrs.material;

    // 1) pipe_kind の val 直引きを優先
    if (pipeVal != null && pipeKindValStyleMap && pipeKindValStyleMap[pipeVal]) {
      return pipeKindValStyleMap[pipeVal];
    }

    // 2) material の val 直引き
    if (matVal != null && materialValStyleMap && materialValStyleMap[matVal]) {
      return materialValStyleMap[matVal];
    }

    // 3) フォールバック: source_type(discr_class) -> attribute -> val の既存解決
    const sourceType = sourceTypeMap?.[String(obj.source_type_id)] || null;
    if (!sourceType) return null;
    const attrMap = styleMap?.[sourceType];
    if (!attrMap) return null;
    for (const attrName of Object.keys(attrMap)) {
      const v = attrs[attrName];
      if (v != null && attrMap[attrName]?.[v]) {
        return attrMap[attrName][v];
      }
    }
    return null;
  };

  // userPositionsが無い場合のカメラ自動フィット
  const fitCameraToObjects = () => {
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!camera || !scene) return;

    const meshes = Object.values(objectsRef.current);
    if (meshes.length === 0) return;

    const box = new THREE.Box3();
    meshes.forEach((m) => {
      if (m) {
        m.updateWorldMatrix(true, true);
        box.expandByObject(m);
      }
    });

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxSize = Math.max(size.x, size.y, size.z);
    const fitOffset = 1.4;
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxSize / 2) / Math.tan(fov / 2) * fitOffset;

    const direction = new THREE.Vector3(1, 1, 1).normalize();
    const newPosition = center.clone().add(direction.multiplyScalar(distance));

    camera.position.copy(newPosition);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    initialCameraPosition.current.copy(camera.position);
    initialCameraRotation.current.copy(camera.rotation);
    previousCameraPosition.current.copy(camera.position);
    previousCameraRotation.current.copy(camera.rotation);
    centerPosition.current.copy(center);

    setCameraInfo({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      roll: ((camera.rotation.z * 180 / Math.PI) % 360).toFixed(1),
      pitch: ((camera.rotation.x * 180 / Math.PI) % 360).toFixed(1),
      yaw: ((camera.rotation.y * 180 / Math.PI) % 360).toFixed(1)
    });
  };

  // マウス移動ハンドラー
  const handleMouseMove = (event) => {
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    mouseMovedRef.current = true;

    // 左Shiftキーが押されている場合は距離計測を優先
    if (event.shiftKey) {
      return;
    }

    // ドラッグ中の処理
    if (isDragging.current && selectedMeshRef.current) {
      const camera = cameraRef.current;
      const raycaster = raycasterRef.current;

      raycaster.setFromCamera(mouseRef.current, camera);
      raycaster.ray.intersectPlane(dragPlane.current, dragIntersection.current);

      if (dragIntersection.current) {
        const offset = dragIntersection.current.clone().sub(dragStartPosition.current);
        selectedMeshRef.current.position.add(offset);

        // ドラッグ開始位置を更新
        dragStartPosition.current.copy(dragIntersection.current);

        // 管路情報表示を更新
        updatePipelineInfoDisplay();
      }
    }
  };

  // マウスダウンハンドラー
  const handleMouseDown = (event) => {
    // 左クリックのみ処理
    if (event.button !== 0) {
      return;
    }

    // 左Shiftキーが押されている場合は距離計測を優先（管路ドラッグを無効化）
    if (event.shiftKey) {
      return;
    }

    // 管路情報表示エリア内のクリックは無視
    if (event.target.closest('.pipeline-info-display') ||
      event.target.closest('.pipeline-info-text') ||
      event.target.closest('.camera-info-container')) {
      return;
    }

    // クリックされた要素が3Dシーンのレンダリング領域内かチェック
    if (event.target !== rendererRef.current?.domElement) {
      return;
    }

    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(
      Object.values(objectsRef.current),
      false
    );

    // visible: true のオブジェクトのみをフィルタリング
    const visibleIntersects = intersects.filter(intersect => intersect.object.visible);

    if (visibleIntersects.length > 0) {
      const clickedObject = visibleIntersects[0].object;

      // すでに選択されているオブジェクトで、かつCtrlキーが押されている場合のみドラッグ開始
      if (clickedObject.userData.objectData &&
        clickedObject === selectedMeshRef.current &&
        event.ctrlKey) {
        // 選択されたオブジェクトをドラッグ開始
        isDragging.current = true;

        // ドラッグ平面を設定（カメラの向きに垂直な平面）
        const camera = cameraRef.current;
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        dragPlane.current.setFromNormalAndCoplanarPoint(
          cameraDirection.negate(),
          clickedObject.position
        );

        // ドラッグ開始位置を記録
        raycasterRef.current.ray.intersectPlane(dragPlane.current, dragStartPosition.current);

        // マウスイベントの伝播を停止
        event.preventDefault();
      }
    }
  };

  // マウスアップハンドラー
  const handleMouseUp = (event) => {
    if (event.button === 0) { // 左クリックのみ
      // 左Shiftキーが押されている場合は距離計測を優先（管路ドラッグを無効化）
      if (event.shiftKey) {
        return;
      }

      if (isDragging.current && selectedMeshRef.current) {
        // ドラッグ終了時にオブジェクトデータを更新
        const currentObjectData = selectedMeshRef.current.userData.objectData;
        const updatedObject = { ...currentObjectData };
        const position = selectedMeshRef.current.position;

        // 位置情報を更新
        if (updatedObject.geometry && updatedObject.geometry[0]) {
          const geom = { ...updatedObject.geometry[0] }; // 深いコピーを作成

          // 中心点を更新（Three.js座標 → データ座標系に変換）
          if (geom.center) {
            geom.center = [position.x, position.z, position.y];
          }

          // 頂点がある場合は相対位置で更新
          if (geom.vertices && geom.vertices.length > 0) {
            const oldCenter = geom.center ? [...geom.center] : [0, 0, 0];
            const newCenter = [position.x, position.z, position.y];
            const offset = [
              newCenter[0] - oldCenter[0],
              newCenter[1] - oldCenter[1],
              newCenter[2] - oldCenter[2]
            ];

            geom.vertices = geom.vertices.map(vertex => [
              vertex[0] + offset[0],
              vertex[1] + offset[1],
              vertex[2] + offset[2]
            ]);
          }

          // 更新されたgeometryを設定
          updatedObject.geometry = [geom];
        }

        // userDataを更新して永続化
        selectedMeshRef.current.userData.objectData = updatedObject;
      }
      isDragging.current = false;
    }
  };

  // 管路情報表示を更新する関数
  const updatePipelineInfoDisplay = () => {
    if (selectedMeshRef.current && selectedMeshRef.current.userData.objectData) {
      // 選択されたオブジェクトの位置を更新
      const currentObjectData = selectedMeshRef.current.userData.objectData;
      const updatedObject = { ...currentObjectData };
      const position = selectedMeshRef.current.position;

      // 位置情報を更新
      if (updatedObject.geometry && updatedObject.geometry[0]) {
        const geom = { ...updatedObject.geometry[0] }; // 深いコピーを作成

        // 中心点を更新（Three.js座標 → データ座標系に変換）
        // Three.js: (x, y, z) → データ: [0]=東西(X), [1]=南北(Z), [2]=上下(Y)
        if (geom.center) {
          geom.center = [position.x, position.z, position.y];
        }

        // 頂点がある場合は相対位置で更新
        if (geom.vertices && geom.vertices.length > 0) {
          const oldCenter = geom.center ? [...geom.center] : [0, 0, 0];
          const newCenter = [position.x, position.z, position.y];
          const offset = [
            newCenter[0] - oldCenter[0],
            newCenter[1] - oldCenter[1],
            newCenter[2] - oldCenter[2]
          ];

          geom.vertices = geom.vertices.map(vertex => [
            vertex[0] + offset[0],
            vertex[1] + offset[1],
            vertex[2] + offset[2]
          ]);
        }

        // 更新されたgeometryを設定
        updatedObject.geometry = [geom];
      }

      setSelectedObject(updatedObject);
    }
  };

  // アウトライン表示関数（EdgesGeometry方式）
  const showOutline = (mesh) => {
    // 既存のアウトラインを削除
    clearOutline();
    
    if (!mesh || !sceneRef.current || !mesh.geometry) return;
    
    try {
      // EdgesGeometryでエッジを抽出（閾値角度を大きくして外枠のみ）
      const edges = new THREE.EdgesGeometry(mesh.geometry, 85);
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffff00,  // 黄色
        linewidth: 2,
        depthTest: false,  // 常に前面に表示
        depthWrite: false
      });
      
      const outline = new THREE.LineSegments(edges, outlineMaterial);
      
      // 元のメッシュと同じ位置・回転・スケールを適用
      outline.position.copy(mesh.position);
      outline.rotation.copy(mesh.rotation);
      outline.scale.copy(mesh.scale);
      
      // メッシュの親オブジェクトがある場合、その変換も考慮
      if (mesh.parent && mesh.parent !== sceneRef.current) {
        mesh.parent.updateMatrixWorld();
        outline.applyMatrix4(mesh.parent.matrixWorld);
      }
      
      sceneRef.current.add(outline);
      outlineHelperRef.current = outline;
    } catch (error) {
      console.error('Failed to create outline:', error);
    }
  };

  // アウトライン削除関数
  const clearOutline = () => {
    if (outlineHelperRef.current && sceneRef.current) {
      sceneRef.current.remove(outlineHelperRef.current);
      if (outlineHelperRef.current.geometry) {
        outlineHelperRef.current.geometry.dispose();
      }
      if (outlineHelperRef.current.material) {
        outlineHelperRef.current.material.dispose();
      }
      outlineHelperRef.current = null;
    }
  };

  // クリックハンドラー
  const handleClick = (event) => {
    // 左Shiftキーが押されている場合は距離計測を優先（管路選択を無効化）
    if (event.shiftKey) {
      return;
    }

    // 管路情報表示エリア内のクリックは無視
    if (event.target.closest('.pipeline-info-display') ||
      event.target.closest('.pipeline-info-text') ||
      event.target.closest('.camera-info-container')) {
      return;
    }

    // クリックされた要素が3Dシーンのレンダリング領域内かチェック
    if (event.target !== rendererRef.current?.domElement) {
      return;
    }

    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(
      Object.values(objectsRef.current),
      false
    );

    // visible: true のオブジェクトのみをフィルタリング
    const visibleIntersects = intersects.filter(intersect => intersect.object.visible);

    if (visibleIntersects.length > 0) {
      const clickedObject = visibleIntersects[0].object;
      const clickPoint = visibleIntersects[0].point; // クリックした位置の3D座標
      if (clickedObject.userData.objectData) {
        // 断面自動作成モードの場合はアウトライン表示のみ（refで最新の値を参照）
        if (autoModeEnabledRef.current) {
          // 断面表示を確実にクリア
          if (crossSectionRef.current) {
            crossSectionRef.current.clear();
          }
          
          setSelectedObject(clickedObject.userData.objectData);
          selectedMeshRef.current = clickedObject;

          // アウトライン表示を更新
          showOutline(clickedObject);
          
          // 生成された断面マーカーから、クリック位置に最も近い断面の位置を使用して断面を生成
          if (generatedSections && generatedSections.length > 0 && crossSectionRef.current) {
            // クリック位置に最も近い断面を探す
            let closestSection = null;
            let minDistance = Infinity;
            
            generatedSections.forEach(section => {
              const sectionPos = new THREE.Vector3(section.position.x, section.position.y, section.z);
              const distance = clickPoint.distanceTo(sectionPos);
              if (distance < minDistance) {
                minDistance = distance;
                closestSection = section;
              }
            });
            
            if (closestSection) {
              // 断面マーカーの位置を使用して断面を生成
              const sectionClickPoint = new THREE.Vector3(
                closestSection.position.x,
                closestSection.position.y,
                closestSection.z
              );
              const gridAngle = closestSection.angle || 0;
              crossSectionRef.current.createCrossSection(clickedObject, sectionClickPoint, gridAngle);
            }
          }
        } else if (enableCrossSectionMode && crossSectionRef.current) {
          // 断面モードの場合は断面を生成
          crossSectionRef.current.createCrossSection(clickedObject, clickPoint);
          // デバッグログ削除
        } else {
          // 通常モードの場合は選択
          setSelectedObject(clickedObject.userData.objectData);
          selectedMeshRef.current = clickedObject;

          // アウトライン表示を更新
          showOutline(clickedObject);
        }
      }
    } else {
      // オブジェクト以外をクリックしても選択状態は維持
      // setSelectedObject(null);
      // selectedMeshRef.current = null;
    }
  };

  // 登録ボタンのハンドラー（API呼び出し用のスケルトン）
  const handleRegister = (objectData, inputValues) => {
    console.log('登録:', objectData, inputValues);
    // TODO: APIを呼び出してサーバーのデータを更新
    // 例: await fetch('/api/pipelines/update', { 
    //   method: 'PUT', 
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ id: objectData.id, changes: inputValues })
    // });
    alert('登録機能は後で実装されます');
  };

  // 複製ボタンのハンドラー
  const handleDuplicate = (objectData) => {
    if (!selectedMeshRef.current || !sceneRef.current) return;

    const geom = objectData.geometry?.[0];

    if (geom && geom.vertices && geom.vertices.length >= 2) {
      // 新しいIDを生成（タイムスタンプで一意性を保証）
      const newKey = `${objectData.id || 'pipe'}_copy_${Date.now()}`;

      // オブジェクトデータをディープコピー（完全に独立したコピーを作成）
      const newObjectData = JSON.parse(JSON.stringify(objectData));
      newObjectData.id = newKey;

      // 選択された管路の真上に配置（上下方向にオフセット）
      // データ座標系: [0]=東西(X), [1]=南北(Z), [2]=上下(Y)
      const verticalOffset = 1.5; // メートル単位（管路の直径に応じて調整可能）

      if (newObjectData.geometry?.[0]?.vertices) {
        newObjectData.geometry[0].vertices = newObjectData.geometry[0].vertices.map(v => [
          v[0],              // 東西はそのまま
          v[1],              // 南北はそのまま
          v[2] + verticalOffset  // 上下方向に移動
        ]);
      }

      // centerプロパティがある場合も更新
      if (newObjectData.geometry?.[0]?.center) {
        newObjectData.geometry[0].center = [
          newObjectData.geometry[0].center[0],
          newObjectData.geometry[0].center[1],
          newObjectData.geometry[0].center[2] + verticalOffset
        ];
      }

      // マップ構築（既存の関数を再利用）
      const shapeTypeMap = buildShapeTypeMap(shapeTypes);
      const sourceTypeMap = buildSourceTypeMap(sourceTypes);
      const styleMap = buildStyleMap(layerData);
      const materialValStyleMap = buildValStyleMap(layerData, 'material');
      const pipeKindValStyleMap = buildValStyleMap(layerData, 'pipe_kind');
      const materialVisibilityMap = (() => {
        const vis = {};
        (layerData || []).forEach(entry => {
          const attr = entry?.attribute;
          const val = entry?.val;
          if (attr === 'material' && val != null) {
            const flag = entry?.val_disp_flag;
            vis[val] = flag === false ? false : true;
          }
        });
        return vis;
      })();

      // 新しいメッシュを作成
      const newMesh = createCityObject(
        newObjectData,
        shapeTypeMap,
        styleMap,
        sourceTypeMap,
        materialVisibilityMap,
        materialValStyleMap,
        pipeKindValStyleMap
      );

      if (newMesh) {
        sceneRef.current.add(newMesh);
        objectsRef.current[newKey] = newMesh;
        originalObjectsData.current[newKey] = JSON.parse(JSON.stringify(newObjectData));

        // 新しいオブジェクトを選択
        selectedMeshRef.current = newMesh;

        // アウトライン表示を更新
        showOutline(newMesh);

        setSelectedObject(newObjectData);
      }
    }
  };

  // 削除ボタンのハンドラー
  const handleDelete = (objectData) => {
    if (!selectedMeshRef.current || !sceneRef.current) return;

    // 確認ダイアログ
    if (!window.confirm('選択された管路を削除しますか？')) {
      return;
    }

    const mesh = selectedMeshRef.current;
    const objectKey = Object.keys(objectsRef.current).find(
      key => objectsRef.current[key] === mesh
    );

    if (objectKey) {
      // シーンから削除
      sceneRef.current.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();

      // 参照を削除
      delete objectsRef.current[objectKey];
      delete originalObjectsData.current[objectKey];

      // 選択状態をクリア
      selectedMeshRef.current = null;
      setSelectedObject(null);

      // アウトラインをクリア
      clearOutline();
    }
  };

  // 追加ボタンのハンドラー（将来実装）
  const handleAdd = () => {
    alert('追加機能は後で実装されます');
  };

  // 復元ボタンのハンドラー
  const handleRestore = (objectData) => {
    if (!selectedMeshRef.current) return;

    const mesh = selectedMeshRef.current;
    const objectKey = Object.keys(objectsRef.current).find(
      key => objectsRef.current[key] === mesh
    );

    if (objectKey && originalObjectsData.current[objectKey]) {
      const originalData = originalObjectsData.current[objectKey];

      // メッシュの位置と形状を元に戻す
      const geom = originalData.geometry?.[0];
      if (geom && geom.vertices && geom.vertices.length >= 2) {
        const start = geom.vertices[0];
        const end = geom.vertices[geom.vertices.length - 1];

        // オブジェクト生成時と同じロジックを使用
        const hasDepthAttrs = (
          originalData.attributes &&
          originalData.attributes.start_point_depth != null &&
          originalData.attributes.end_point_depth != null &&
          Number.isFinite(Number(originalData.attributes.start_point_depth)) &&
          Number.isFinite(Number(originalData.attributes.end_point_depth))
        );

        let startPoint, endPoint;
        if (hasDepthAttrs) {
          const startDepth = Number(originalData.attributes.start_point_depth / 100);
          const endDepth = Number(originalData.attributes.end_point_depth / 100);
          startPoint = new THREE.Vector3(start[0], startDepth > 0 ? -startDepth : startDepth, start[1]);
          endPoint = new THREE.Vector3(end[0], endDepth > 0 ? -endDepth : endDepth, end[1]);
        } else {
          // データ座標系 → Three.js座標系に変換
          // データ: [0]=東西(X), [1]=南北(Z), [2]=上下(Y) → Three.js: (x, y, z)
          startPoint = new THREE.Vector3(start[0], start[2], start[1]);
          endPoint = new THREE.Vector3(end[0], end[2], end[1]);
        }

        const center = startPoint.clone().add(endPoint).multiplyScalar(0.5);
        mesh.position.copy(center);

        const direction = endPoint.clone().sub(startPoint).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        mesh.setRotationFromQuaternion(quaternion);

        // スケールをリセット
        mesh.scale.set(1, 1, 1);
      }

      // userDataを元に戻す
      mesh.userData.objectData = JSON.parse(JSON.stringify(originalData));
      setSelectedObject(JSON.parse(JSON.stringify(originalData)));
    }
  };

  // 全て復元ボタンのハンドラー
  const handleRestoreAll = () => {
    // 確認ダイアログ
    if (!window.confirm('すべての管路を元に戻しますか？')) {
      return;
    }

    Object.keys(objectsRef.current).forEach(key => {
      const mesh = objectsRef.current[key];
      const originalData = originalObjectsData.current[key];

      if (mesh && originalData) {
        const geom = originalData.geometry?.[0];
        if (geom && geom.vertices && geom.vertices.length >= 2) {
          const start = geom.vertices[0];
          const end = geom.vertices[geom.vertices.length - 1];

          // オブジェクト生成時と同じロジックを使用
          const hasDepthAttrs = (
            originalData.attributes &&
            originalData.attributes.start_point_depth != null &&
            originalData.attributes.end_point_depth != null &&
            Number.isFinite(Number(originalData.attributes.start_point_depth)) &&
            Number.isFinite(Number(originalData.attributes.end_point_depth))
          );

          let startPoint, endPoint;
          if (hasDepthAttrs) {
            const startDepth = Number(originalData.attributes.start_point_depth / 100);
            const endDepth = Number(originalData.attributes.end_point_depth / 100);
            startPoint = new THREE.Vector3(start[0], startDepth > 0 ? -startDepth : startDepth, start[1]);
            endPoint = new THREE.Vector3(end[0], endDepth > 0 ? -endDepth : endDepth, end[1]);
          } else {
            // データ座標系 → Three.js座標系に変換
            // データ: [0]=東西(X), [1]=南北(Z), [2]=上下(Y) → Three.js: (x, y, z)
            startPoint = new THREE.Vector3(start[0], start[2], start[1]);
            endPoint = new THREE.Vector3(end[0], end[2], end[1]);
          }

          const center = startPoint.clone().add(endPoint).multiplyScalar(0.5);
          mesh.position.copy(center);

          const direction = endPoint.clone().sub(startPoint).normalize();
          const up = new THREE.Vector3(0, 1, 0);
          const quaternion = new THREE.Quaternion();
          quaternion.setFromUnitVectors(up, direction);
          mesh.setRotationFromQuaternion(quaternion);

          // スケールをリセット
          mesh.scale.set(1, 1, 1);
        }

        mesh.userData.objectData = JSON.parse(JSON.stringify(originalData));
      }
    });

    // 選択中のオブジェクトがあれば更新
    if (selectedMeshRef.current) {
      const objectKey = Object.keys(objectsRef.current).find(
        key => objectsRef.current[key] === selectedMeshRef.current
      );
      if (objectKey && originalObjectsData.current[objectKey]) {
        setSelectedObject(JSON.parse(JSON.stringify(originalObjectsData.current[objectKey])));
      }
    }
  };

  // キーボード操作
  const handleKeyDown = (event) => {
    // 入力欄にフォーカスがある場合は無視
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }
    keysPressed.current[event.key.toLowerCase()] = true;
  };

  const handleKeyUp = (event) => {
    // 入力欄にフォーカスがある場合は無視
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }
    keysPressed.current[event.key.toLowerCase()] = false;
  };

  // 初期化
  useEffect(() => {
    if (!mountRef.current) return;

    // シーンの作成
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 背景を設定（断面図モードの場合は白、通常モードはSkyコンポーネントが描画）
    scene.background = hideBackground ? new THREE.Color(0xf5f5f5) : null;

    // フォグを追加して深度感を出す（断面図モードでは無効）
    if (!hideBackground) {
      scene.fog = new THREE.Fog(0x8B7355, 20, 100);
    }
    // カメラの作成
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    initialCameraPosition.current.copy(camera.position);
    initialCameraRotation.current.copy(camera.rotation);
    cameraRef.current = camera;

    // レンダラーの作成
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // ピクセル比率を制限
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // トーンマッピング設定（EffectComposer使用時の色と明るさを正確に）
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // WebGLコンテキスト喪失のハンドリング
    const handleContextLost = (event) => {
      event.preventDefault();
      console.warn('WebGL context lost. Preventing default behavior.');
    };

    const handleContextRestored = () => {};

    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControlsの初期化
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    // controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false; // パン操作を無効化
    controls.enableRotate = true;

    // ターゲットの制約を緩和して自由なカメラ移動を実現
    controls.target.set(0, 0, 0); // 固定ターゲット
    controls.maxDistance = Infinity; // 最大距離制限を解除
    controls.minDistance = 0.1;     // 最小距離制限を設定
    controls.maxPolarAngle = Math.PI; // 垂直回転制限を解除（上下360度回転可能）
    controls.minPolarAngle = 0;      // 垂直回転制限を解除

    // マウス操作の割当: 左クリック無効、右ドラッグ=回転、中クリック=ズーム
    controls.mouseButtons = {
      LEFT: null, // 左クリックを無効化
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };

    // 操作速度を調整
    controls.rotateSpeed = 0.5;   // 回転速度
    controls.zoomSpeed = 0.5;     // ズーム速度
    controls.keyRotateSpeed = 1.0; // キーボード回転速度
    controlsRef.current = controls;

    // Sky コンポーネントの初期化（コンテナを渡す）
    // 断面図生成モードの場合はGUIを非表示
    const skyComponent = new SkyComponent(scene, renderer, mountRef.current, !enableCrossSectionMode);
    skyComponentRef.current = skyComponent;

    // 初期カメラは props.userPositions から設定（App 側でフェッチ済み）
    if (userPositions && userPositions.length > 0) {
      const userPos = userPositions[0]; // 配列の最初の要素を取得
      const regionXY = parsePointWkt(userPos.reqion_position);
      const height = Number(userPos.reqion_hight);
      const yawDeg = Number(userPos.yaw);
      const pitchDeg = Number(userPos.pitch);
      const rollDeg = Number(userPos.roll);

      if (regionXY && Number.isFinite(height)) {
        camera.position.set(regionXY.x, height, regionXY.y);
      }

      if ([yawDeg, pitchDeg, rollDeg].some((v) => Number.isFinite(v))) {
        const yaw = THREE.MathUtils.degToRad(Number.isFinite(yawDeg) ? yawDeg : 0);
        const pitch = THREE.MathUtils.degToRad(Number.isFinite(pitchDeg) ? pitchDeg : 0);
        const roll = THREE.MathUtils.degToRad(Number.isFinite(rollDeg) ? rollDeg : 0);
        camera.rotation.set(pitch, yaw, roll, 'XYZ');

        // ここで OrbitControls の target をカメラの前方に合わせて再設定し、初期回転を維持
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const target = camera.position.clone().add(forward.multiplyScalar(10));
        controls.target.copy(target);
        controls.update();
      }

      initialCameraPosition.current.copy(camera.position);
      initialCameraRotation.current.copy(camera.rotation);
      previousCameraPosition.current.copy(camera.position);
      previousCameraRotation.current.copy(camera.rotation);

      const cameraInfoData = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        roll: (Number.isFinite(rollDeg) ? rollDeg : 0).toFixed(1),
        pitch: (Number.isFinite(pitchDeg) ? pitchDeg : 0).toFixed(1),
        yaw: (Number.isFinite(yawDeg) ? yawDeg : 0).toFixed(1)
      };
      setCameraInfo(cameraInfoData);
    }

    // OrbitControlsがマウス操作を処理するため、カスタムマウスドラッグは削除

    // ライティングを設定（太陽の位置に合わせて調整）
    const ambientLight = new THREE.AmbientLight(
      0xffffff,  // 白色
      hideBackground ? 2.5 : 1.4  // 断面図モードでは2.5、通常は1.4
    );
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // 太陽光の色を調整（暖かい色合い）
    directionalLight.color.setHex(0xfff4e6);

    // 追加のライトで色をより明るく
    const additionalLight = new THREE.DirectionalLight(0xffffff, 0.2);
    additionalLight.position.set(-1, -1, 1);
    scene.add(additionalLight);

    // EffectComposerとOutlinePassは使用しない（EdgesGeometry方式を使用）

    // 断面図の初期化（断面モードが有効な場合）
    if (enableCrossSectionMode) {
      const crossSection = new CrossSectionPlane(
        scene,
        camera,
        objectsRef
      );
      crossSectionRef.current = crossSection;
    }

    // 距離計測の初期化
    const distanceMeasurement = new DistanceMeasurement(
      scene,
      camera,
      renderer,
      objectsRef,  // refオブジェクト自体を渡す
      raycasterRef.current,
      mouseRef.current,
      crossSectionRef  // CSG断面用のrefを追加
    );
    distanceMeasurement.setResultUpdateCallback(setMeasurementResult);
    distanceMeasurement.enable(mountRef.current);
    distanceMeasurementRef.current = distanceMeasurement;

    // イベントリスナー
    mountRef.current.addEventListener('mousemove', handleMouseMove);
    mountRef.current.addEventListener('mousedown', handleMouseDown);
    mountRef.current.addEventListener('mouseup', handleMouseUp);
    mountRef.current.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // リサイズハンドラー
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);

      // CrossSectionPlaneのLine2マテリアルのresolutionを更新
      if (crossSectionRef.current) {
        crossSectionRef.current.handleResize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    // アニメーションループ
    const animate = () => {
      requestAnimationFrame(animate);

      // 左Shiftキーでマウス操作を低速化
      if (keysPressed.current['shift']) {
        controls.rotateSpeed = 0.5;
        controls.zoomSpeed = 0.5;
      } else {
        controls.rotateSpeed = 1.0;
        controls.zoomSpeed = 1.0;
      }

      // OrbitControlsの更新
      controls.update();

      // キーボード操作でカメラ移動
      const speed = keysPressed.current['shift'] ? 0.1 : 1.0; // Shiftで低速
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);

      let cameraMoved = false;

      // W:上 S:下
      if (keysPressed.current['w']) {
        camera.position.add(up.clone().multiplyScalar(speed));
        cameraMoved = true;
      }
      if (keysPressed.current['s']) {
        camera.position.add(up.clone().multiplyScalar(-speed));
        cameraMoved = true;
      }

      // A:左 D:右
      if (keysPressed.current['a']) {
        camera.position.add(right.clone().multiplyScalar(-speed));
        cameraMoved = true;
      }
      if (keysPressed.current['d']) {
        camera.position.add(right.clone().multiplyScalar(speed));
        cameraMoved = true;
      }

      // Q:後進 E:前進
      if (keysPressed.current['q']) {
        camera.position.add(forward.clone().multiplyScalar(-speed));
        cameraMoved = true;
      }
      if (keysPressed.current['e']) {
        camera.position.add(forward.clone().multiplyScalar(speed));
        cameraMoved = true;
      }

      // カメラが移動した場合、ターゲットも動的に更新
      if (cameraMoved) {
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        controls.target.copy(camera.position.clone().add(direction.multiplyScalar(10)));
      }

      // Y:位置向き初期化
      if (keysPressed.current['y']) {
        camera.position.copy(initialCameraPosition.current);
        camera.rotation.copy(initialCameraRotation.current);
        controls.target.set(0, 0, 0);
        keysPressed.current['y'] = false;
      }

      // P:向き初期化
      if (keysPressed.current['p']) {
        camera.rotation.copy(initialCameraRotation.current);
        keysPressed.current['p'] = false;
      }

      // O:位置初期化
      if (keysPressed.current['o']) {
        camera.position.copy(initialCameraPosition.current);
        keysPressed.current['o'] = false;
      }

      // L:パン北向き
      if (keysPressed.current['l']) {
        camera.rotation.y = 0;
        keysPressed.current['l'] = false;
      }

      // I:チルト水平
      if (keysPressed.current['i']) {
        camera.rotation.x = 0;
        keysPressed.current['i'] = false;
      }

      // T:チルト真下
      if (keysPressed.current['t']) {
        camera.rotation.x = Math.PI / 2;
        keysPressed.current['t'] = false;
      }

      // R:チルト水平・高さ初期値
      if (keysPressed.current['r']) {
        camera.rotation.x = 0;
        camera.position.y = initialCameraPosition.current.y;
        keysPressed.current['r'] = false;
      }

      // 1: ガイド表示トグル（左上・左下の情報）
      if (keysPressed.current['1']) {
        setShowGuides((prev) => !prev);
        keysPressed.current['1'] = false;
      }

      // 7: 管路表示トグル + 切り口表示トグル
      if (keysPressed.current['7']) {
        setShowPipes((prev) => {
          const newShowPipes = !prev;
          // 管路と切り口の表示を逆にする
          if (enableCrossSectionMode && crossSectionRef.current) {
            crossSectionRef.current.toggleCrossSections(!newShowPipes);
          }
          return newShowPipes;
        });
        keysPressed.current['7'] = false;
      }

      // 9: 地表面表示トグル
      if (keysPressed.current['9']) {
        setShowFloor((prev) => !prev);
        keysPressed.current['9'] = false;
      }

      // 2: 背景表示トグル
      if (keysPressed.current['2']) {
        setShowBackground((prev) => !prev);
        keysPressed.current['2'] = false;
      }

      // ESC: 計測結果と管路情報表示をクリア
      if (keysPressed.current['escape']) {
        // 計測結果がある場合は計測結果のみクリア
        if (distanceMeasurementRef.current && measurementResult) {
          distanceMeasurementRef.current.clear();
        } else {
          // 計測結果がない場合は管路情報表示をクリア
          setSelectedObject(null);
          selectedMeshRef.current = null;
          // アウトラインをクリア
          clearOutline();
        }
        keysPressed.current['escape'] = false;
      }

      // Backspace: 断面をクリア（断面モードの場合）
      if (keysPressed.current['backspace']) {
        if (enableCrossSectionMode && crossSectionRef.current) {
          crossSectionRef.current.clear();
          // デバッグログ削除
        }
        keysPressed.current['backspace'] = false;
      }

      // U:パン重心
      if (keysPressed.current['u']) {
        const direction = centerPosition.current.clone().sub(camera.position);
        const angle = Math.atan2(direction.x, direction.z);
        camera.rotation.y = angle;
        keysPressed.current['u'] = false;
      }

      // J:位置重心
      if (keysPressed.current['j']) {
        camera.position.copy(centerPosition.current);
        keysPressed.current['j'] = false;
      }

      // H:重心向き後進
      if (keysPressed.current['h']) {
        const direction = centerPosition.current.clone().sub(camera.position).normalize();
        camera.position.add(direction.multiplyScalar(-speed));
      }

      // G:重心向き前進
      if (keysPressed.current['g']) {
        const direction = centerPosition.current.clone().sub(camera.position).normalize();
        camera.position.add(direction.multiplyScalar(speed));
      }

      // K:重心真下
      if (keysPressed.current['k']) {
        camera.position.set(centerPosition.current.x, camera.position.y, centerPosition.current.z);
        keysPressed.current['k'] = false;
      }

      // レイキャスティングでホバー検出（マウス移動時のみ実行してパフォーマンス改善）
      if (mouseMovedRef.current) {
        mouseMovedRef.current = false; // フラグをリセット

        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObjects(
          Object.values(objectsRef.current),
          false
        );

        // visible: true のオブジェクトのみをフィルタリング
        const visibleIntersects = intersects.filter(intersect => intersect.object.visible);

        // 前回ホバーしていたオブジェクトをクリア
        if (hoveredObjectRef.current) {
          document.body.style.cursor = 'default';
          hoveredObjectRef.current = null;
        }

        // 新しくホバーしたオブジェクトを設定（選択中は除外）
        if (visibleIntersects.length > 0) {
          const hoveredObject = visibleIntersects[0].object;
          if (hoveredObject !== selectedMeshRef.current) {
            document.body.style.cursor = 'pointer';
            hoveredObjectRef.current = hoveredObject;
          }
        }
      }

      // カメラ位置情報を更新（位置または回転に変化があった場合のみ）
      const positionChanged = camera.position.distanceTo(previousCameraPosition.current) > 0.001;
      const rotationChanged =
        Math.abs(camera.rotation.x - previousCameraRotation.current.x) > 0.01 ||
        Math.abs(camera.rotation.y - previousCameraRotation.current.y) > 0.01 ||
        Math.abs(camera.rotation.z - previousCameraRotation.current.z) > 0.01;


      if (positionChanged || rotationChanged) {
        const radToDeg = (rad) => ((rad * 180 / Math.PI) % 360).toFixed(1);
        const animationCameraInfo = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          roll: radToDeg(camera.rotation.z),
          pitch: radToDeg(camera.rotation.x),
          yaw: radToDeg(camera.rotation.y)
        };
        setCameraInfo(animationCameraInfo);

        // 前回の値を更新
        previousCameraPosition.current.copy(camera.position);
        previousCameraRotation.current.copy(camera.rotation);
      }

      // 距離計測の線をカメラに向けて回転
      if (distanceMeasurementRef.current) {
        distanceMeasurementRef.current.update();
      }

      // 断面の深さラベルをカメラからの距離に応じて更新
      if (crossSectionRef.current) {
        crossSectionRef.current.update();
      }

      // アウトラインの位置を更新（選択されたメッシュが移動した場合）
      if (outlineHelperRef.current && selectedMeshRef.current) {
        const mesh = selectedMeshRef.current;
        mesh.updateMatrixWorld();
        
        // アウトラインの位置・回転・スケールを更新
        outlineHelperRef.current.position.copy(mesh.position);
        outlineHelperRef.current.rotation.copy(mesh.rotation);
        outlineHelperRef.current.scale.copy(mesh.scale);
        outlineHelperRef.current.updateMatrixWorld();
      }

      // レンダリング（エラーハンドリング付き）
      try {
        renderer.render(scene, camera);
      } catch (error) {
        console.error('Rendering error:', error);
        // エラー発生時はアニメーションを停止
        return;
      }
    };
    animate();

    // クリーンアップ
    return () => {
      // mountRef.currentを一時変数に保存（null化される前に）
      const currentMount = mountRef.current;

      // 距離計測のクリーンアップ（最初に実行）
      if (distanceMeasurementRef.current && currentMount) {
        try {
          distanceMeasurementRef.current.dispose(currentMount);
        } catch (error) {
          console.error('距離計測のクリーンアップでエラー:', error);
        }
      }

      // 断面図のクリーンアップ
      if (crossSectionRef.current) {
        try {
          crossSectionRef.current.dispose();
        } catch (error) {
          console.error('断面図のクリーンアップでエラー:', error);
        }
      }

      // イベントリスナーの削除
      try {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      } catch (error) {
        console.error('windowイベントリスナーの削除でエラー:', error);
      }
      try {
        if (currentMount) {
          currentMount.removeEventListener('mousemove', handleMouseMove);
          currentMount.removeEventListener('mousedown', handleMouseDown);
          currentMount.removeEventListener('mouseup', handleMouseUp);
          currentMount.removeEventListener('click', handleClick);
        }
      } catch (error) {
        console.error('DOMイベントリスナーの削除でエラー:', error);
      }

      // コンポーネントのクリーンアップ
      if (skyComponentRef.current) {
        skyComponentRef.current.dispose();
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      // アウトラインのクリーンアップ
      clearOutline();

      // シーン内のすべてのオブジェクトをクリーンアップ
      if (scene) {
        scene.traverse((object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => {
                if (material.map) material.map.dispose();
                material.dispose();
              });
            } else {
              if (object.material.map) object.material.map.dispose();
              object.material.dispose();
            }
          }
        });
        scene.clear();
      }

      // レンダラーのクリーンアップ
      if (renderer) {
        // レンダラーのdisposeでイベントリスナーも自動的にクリーンアップされます
        if (currentMount && renderer.domElement.parentNode === currentMount) {
          currentMount.removeChild(renderer.domElement);
        }
        renderer.dispose();
        // forceContextLossはWebGL1のみで利用可能
        if (renderer.forceContextLoss) {
          renderer.forceContextLoss();
        }
        // WebGL2の場合
        const gl = renderer.getContext();
        if (gl && gl.getExtension('WEBGL_lose_context')) {
          gl.getExtension('WEBGL_lose_context').loseContext();
        }
      }
    };
  }, [userPositions]);

  // オブジェクトの作成（初回のみ）
  useEffect(() => {
    if (!sceneRef.current || !cityJsonData) return;

    // 既存のオブジェクトを削除
    Object.values(objectsRef.current).forEach(obj => {
      sceneRef.current.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    });
    objectsRef.current = {};

    // 選択状態もクリア
    selectedMeshRef.current = null;

    // マップ構築
    const shapeTypeMap = buildShapeTypeMap(shapeTypes);
    const sourceTypeMap = buildSourceTypeMap(sourceTypes);
    const styleMap = buildStyleMap(layerData);
    const materialValStyleMap = buildValStyleMap(layerData, 'material');
    const pipeKindValStyleMap = buildValStyleMap(layerData, 'pipe_kind');
    // material ごとの初期表示フラグを構築（val_disp_flag を採用）
    const materialVisibilityMap = (() => {
      const vis = {};
      (layerData || []).forEach(entry => {
        const attr = entry?.attribute;
        const val = entry?.val;
        if (attr === 'material' && val != null) {
          const flag = entry?.val_disp_flag;
          vis[val] = flag === false ? false : true;
        }
      });
      return vis;
    })();

    // CityObjects 全体から生成
    const entries = cityJsonData.CityObjects ? Object.entries(cityJsonData.CityObjects) : [];
    entries.forEach(([key, obj]) => {
      const mesh = createCityObject(
        obj,
        shapeTypeMap,
        styleMap,
        sourceTypeMap,
        materialVisibilityMap,
        materialValStyleMap,
        pipeKindValStyleMap
      );
      if (mesh) {
        sceneRef.current.add(mesh);
        objectsRef.current[key] = mesh;
        // 元データを保存（ディープコピー）
        originalObjectsData.current[key] = JSON.parse(JSON.stringify(obj));
      }
    });

    // オブジェクト作成後に地表面のサイズを更新
    if (Object.values(objectsRef.current).length > 0) {
      const box = new THREE.Box3();
      Object.values(objectsRef.current).forEach((m) => {
        if (m) {
          m.updateWorldMatrix(true, true);
          box.expandByObject(m);
        }
      });

      const size = new THREE.Vector3();
      box.getSize(size);

      // XとZの最大値を取得し、余裕を持たせる（2倍）
      const maxSize = Math.max(size.x, size.z, 1000) * 2;

      // 新しいサイズで床を再作成
      const floorGeometry = new THREE.PlaneGeometry(maxSize, maxSize);
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: '#d0d0d0',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        roughness: 0.5
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0;
      floor.receiveShadow = true;
      sceneRef.current.add(floor);
      floorRef.current = floor;
    }

    // userPositions が無ければ自動フィット
    if (!userPositions || userPositions.length === 0) {
      fitCameraToObjects();
    }
  }, [cityJsonData, shapeTypes, layerData, sourceTypes]);

  // 管路表示制御
  useEffect(() => {
    if (!sceneRef.current) return;

    Object.values(objectsRef.current).forEach(mesh => {
      if (mesh && mesh.userData.objectData) {
        const obj = mesh.userData.objectData;
        // 管路オブジェクト（Cylinder + LineString または LineString）の表示制御
        const isPipe = (
          (obj.shape_type === 16 && obj.geometry?.[0]?.type === 'LineString') || // Cylinder + LineString
          (obj.geometry?.[0]?.type === 'LineString')  // LineString
        );

        if (isPipe) {
          // 断面表示モードの場合は管路を非表示にする
          mesh.visible = !sectionViewMode && showPipes && mesh.userData.initialVisible !== false;
        }
      }
    });
  }, [showPipes, sectionViewMode]);

  // 地表面表示制御
  useEffect(() => {
    if (floorRef.current) {
      floorRef.current.visible = showFloor;
    }
  }, [showFloor]);

  // 背景表示制御
  useEffect(() => {
    if (skyComponentRef.current) {
      skyComponentRef.current.setBackgroundVisible(showBackground);
    }
  }, [showBackground]);

  // 断面自動作成モードの状態をrefに同期
  useEffect(() => {
    autoModeEnabledRef.current = autoModeEnabled;
  }, [autoModeEnabled]);

  // 選択されたオブジェクトの変更を通知
  useEffect(() => {
    if (onSelectedObjectChange) {
      onSelectedObjectChange(selectedObject, selectedMeshRef.current);
    }
  }, [selectedObject, onSelectedObjectChange]);

  // 断面自動作成モードが変更された時の処理
  useEffect(() => {
    if (!mountRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    
    if (autoModeEnabled && enableCrossSectionMode) {
      // 断面自動作成モードが有効になった時
      // 既存の断面表示（水平線など）を確実にクリア
      if (crossSectionRef.current) {
        crossSectionRef.current.clear();
        // クリア後、少し待ってから再度クリア（確実に削除するため）
        setTimeout(() => {
          if (crossSectionRef.current) {
            crossSectionRef.current.clear();
          }
        }, 100);
      }
      
      // アウトラインをクリア（EdgesGeometry方式を使用するため、特別な初期化は不要）
      clearOutline();
    } else if (!autoModeEnabled && enableCrossSectionMode) {
      // 断面自動作成モードが無効になった時
      // アウトラインをクリア（通常の断面モードに戻る）
      clearOutline();
    }
  }, [autoModeEnabled, enableCrossSectionMode]);

  // 生成された断面を3D空間に描画
  const drawGeneratedSectionsInScene = (sections) => {
    if (!sceneRef.current) return;

    // 既存の断面マーカーをクリア
    if (generatedSectionMarkersRef.current) {
      generatedSectionMarkersRef.current.forEach(marker => {
        sceneRef.current.remove(marker);
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material) marker.material.dispose();
      });
      generatedSectionMarkersRef.current = [];
    }

    // 各断面の位置にマーカーを描画
    sections.forEach((section) => {
      // 断面位置を示す球体マーカー
      const geometry = new THREE.SphereGeometry(0.3, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(section.position);
      marker.userData.sectionData = section;
      sceneRef.current.add(marker);
      generatedSectionMarkersRef.current.push(marker);
    });
  };

  // generatedSectionsが変更された時に描画
  useEffect(() => {
    if (generatedSections && generatedSections.length > 0) {
      drawGeneratedSectionsInScene(generatedSections);
    } else {
      // クリア
      if (generatedSectionMarkersRef.current) {
        generatedSectionMarkersRef.current.forEach(marker => {
          if (sceneRef.current) {
            sceneRef.current.remove(marker);
            if (marker.geometry) marker.geometry.dispose();
            if (marker.material) marker.material.dispose();
          }
        });
        generatedSectionMarkersRef.current = [];
      }
    }
  }, [generatedSections]);

  // 断面表示モードの処理
  useEffect(() => {
    if (sectionViewMode && generatedSections && generatedSections.length > 0 && crossSectionRef.current) {
      const currentSection = generatedSections[currentSectionIndex];
      if (currentSection) {
        // 選択された管路を取得
        const selectedPipe = selectedMeshRef.current;
        if (selectedPipe && selectedPipe.userData.objectData) {
          // 断面を生成
          const clickPoint = new THREE.Vector3(
            currentSection.position.x,
            currentSection.position.y,
            currentSection.z
          );
          // グリッド線の角度を渡す
          const gridAngle = currentSection.angle || 0;
          crossSectionRef.current.clear();
          crossSectionRef.current.createCrossSection(selectedPipe, clickPoint, gridAngle);
          // 断面表示モードでは断面を表示する
          crossSectionRef.current.toggleCrossSections(true);
          
          // カメラを断面平面に正対させる
          if (cameraRef.current && controlsRef.current) {
            // グリッド線の角度から断面平面の法線ベクトルを計算
            const angleRad = THREE.MathUtils.degToRad(gridAngle);
            // グリッド線の方向ベクトル
            const gridDirection = new THREE.Vector3(
              Math.cos(angleRad),
              0,
              Math.sin(angleRad)
            ).normalize();
            // 断面平面の法線ベクトル（グリッド線に垂直）
            const planeNormal = new THREE.Vector3(gridDirection.z, 0, -gridDirection.x).normalize();
            
            // カメラの位置を断面平面から適当な距離に配置（法線ベクトルの方向に）
            const cameraDistance = 50; // グリッド線からの距離
            const planePoint = new THREE.Vector3(clickPoint.x, 0, clickPoint.z);
            const cameraPosition = planePoint.clone().add(planeNormal.clone().multiplyScalar(cameraDistance));
            // カメラの高さを適当に設定（断面が見えるように）
            cameraPosition.y = 20;
            
            cameraRef.current.position.copy(cameraPosition);
            // カメラを断面平面の中心に向ける
            cameraRef.current.lookAt(planePoint);
            controlsRef.current.target.copy(planePoint);
            controlsRef.current.update();
          }
        }
      }
    } else if (!sectionViewMode && crossSectionRef.current) {
      // 断面表示モードが無効になった時はクリア
      crossSectionRef.current.clear();
      // 断面も非表示にする
      crossSectionRef.current.toggleCrossSections(false);
    }
  }, [sectionViewMode, currentSectionIndex, generatedSections]);

  // refで公開するメソッド
  useImperativeHandle(ref, () => ({
    drawGeneratedSections: (sections) => {
      drawGeneratedSectionsInScene(sections);
    }
  }));

  return (
    <div className="scene3d-container">
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* 左上の管路情報 */}
      {showGuides && !hideInfoPanel && (
        <div className="pipeline-info-text">
          ◆管路情報<br />
          左クリック: 管路情報を表示します<br />
          ESCキー: 管路情報表示をクリア<br />
          ◆離隔計測<br />
          左Shift+左ドラッグ: 管路間の最近接距離を計測します<br />
          ESCキー: 離隔をクリア<br />
          ◆表示切り替え<br />
          1: ガイド 2: 背景 5:離隔 6: 折れ線 7: 管路 8: 路面 9: 地表面<br />
          Space: 透視投影・正射投影 マウスホイール: 拡大縮小 +左Ctrlキー: 低速<br />
          ◆離隔計測結果
          {/* 距離計測結果を表示 */}
          {measurementResult && (
            <DistanceMeasurementDisplay measurementResult={measurementResult} />
          )}
          {/* 選択された管路情報を表示 */}
          {selectedObject && (
            <PipelineInfoDisplay
              selectedObject={selectedObject}
              shapeTypes={shapeTypes}
              // onRegister={handleRegister}
              // onDuplicate={handleDuplicate}
              // onDelete={handleDelete}
              // onAdd={handleAdd}
              onRestore={handleRestore}
              // onRestoreAll={handleRestoreAll}
            />
          )}
        </div>
      )}

      {/* 左下のカメラ情報 */}
      {showGuides && (
        <div className="camera-info-container">
          <div className="camera-position-info">
            ◆カメラ位置<br />
            座標: 東西 {cameraInfo.x.toFixed(3)} 高さ {cameraInfo.y.toFixed(3)} 南北 {cameraInfo.z.toFixed(3)} [m]<br />
            向き:ロール {cameraInfo.roll} ピッチ {cameraInfo.pitch} ヨー {cameraInfo.yaw} [度]
          </div>
          <div className="camera-controls-info">
            ◆カメラ操作<br />
            W: 上 S:下 A:左 D:右 Q:後進 E:前進 +左Shiftキー:低速（キー・マウス両方） <br />
            Y:位置向き初期化 P:向き初期化 O:位置初期化<br />
            L:パン北向き I:チルト水平 T:チルト真下 R:チルト水平・高さ初期値<br />
            U:パン重心 J:位置重心 H:重心向き後進 G:重心向き前進 K:重心真下
          </div>
        </div>
      )}
    </div>
  );
});

export default Scene3D;

