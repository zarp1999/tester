import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SkyComponent from './SkyComponent';
import PipelineInfoDisplay from './PipelineInfoDisplay';
import InfiniteGridHelper from './InfiniteGridHelper';
import './Scene3D.css';

/**
 * 3Dシーンコンポーネント
 * - CityJSONの内容からオブジェクトを生成
 * - キー/マウスによるカメラ操作
 * - 左上: 管路情報、左下: カメラ情報（キー1でトグル）
 */
function Scene3D({ cityJsonData, onObjectClick, onCameraMove, userPositions, shapeTypes, layerData, sourceTypes }) {
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
  const initialCameraPosition = useRef(new THREE.Vector3(20, 20, 20));
  const initialCameraRotation = useRef(new THREE.Euler());
  const centerPosition = useRef(new THREE.Vector3(0, 0, 0));
  const previousCameraPosition = useRef(new THREE.Vector3(20, 20, 20));
  const previousCameraRotation = useRef(new THREE.Euler());
  
  // ドラッグ機能用のref
  const isDragging = useRef(false);
  const dragStartPosition = useRef(new THREE.Vector3());
  const dragPlane = useRef(new THREE.Plane());
  const dragIntersection = useRef(new THREE.Vector3());
  
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
  const [showBackground, setShowBackground] = useState(true);


  // 3Dオブジェクトの作成（shape/color対応）
  /**
   * CityJSONオブジェクトからThree.jsメッシュを生成する。
   * - shape_type（例: Cylinder）と geometry.type（例: LineString）で分岐
   * - source_type_id/layer_panel で色・透明度を決定
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

        let startPoint, endPoint;
        if (hasDepthAttrs) {
          const startDepth = Number(obj.attributes.start_point_depth / 100);
          const endDepth = Number(obj.attributes.end_point_depth / 100);
          startPoint = new THREE.Vector3(start[0], startDepth > 0 ? -startDepth : startDepth, start[1]);
          endPoint = new THREE.Vector3(end[0], endDepth > 0 ? -endDepth : endDepth, end[1]);
        } else {
          startPoint = new THREE.Vector3(start[0], start[1], start[2]);
          endPoint = new THREE.Vector3(end[0], end[1], end[2]);
        }

        // 円柱の高さと方向を計算
        const height = startPoint.distanceTo(endPoint);
        let radius;
        if (shapeTypeName === 'Cylinder') {
          radius = (obj.attributes?.radius != null) ? Number(obj.attributes.radius) : 0.3;
          if (radius > 5) radius = radius / 1000;
          radius = Math.max(radius, 0.05);
        }else{
          radius = 0.05;
        }
        geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
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

    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.3,
      roughness: 0.7,
      transparent: opacity < 1,
      opacity
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
        
        let startPoint, endPoint;
        if (hasDepthAttrs) {
          const startDepth = Number(obj.attributes.start_point_depth / 100);
          const endDepth = Number(obj.attributes.end_point_depth / 100);
          startPoint = new THREE.Vector3(start[0], startDepth > 0 ? -startDepth : startDepth, start[1]);
          endPoint = new THREE.Vector3(end[0], endDepth > 0 ? -endDepth : endDepth, end[1]);
        } else {
          startPoint = new THREE.Vector3(start[0], start[1], start[2]);
          endPoint = new THREE.Vector3(end[0], end[1], end[2]);
        }
        // 円柱を正しい方向に回転
        const direction = endPoint.clone().sub(startPoint).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        // geometry.applyQuaternion(quaternion);
        mesh.setRotationFromQuaternion(quaternion);
        const center = startPoint.clone().add(endPoint).multiplyScalar(0.5);
        mesh.position.copy(center);
      }
    } else {
      // その他の形状の位置設定
      const center = geom.center || geom.start || geom.vertices?.[0] || [0, 0, 0];
      mesh.position.set(center[0], center[1], center[2]);
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
      // 後勝ち/上書き。必要ならここで優先ルールを変更
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

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      
      if (clickedObject.userData.objectData && clickedObject === selectedMeshRef.current) {
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
        
        // 中心点を更新
        if (geom.center) {
          geom.center = [position.x, position.y, position.z];
        }
        
        // 頂点がある場合は相対位置で更新
        if (geom.vertices && geom.vertices.length > 0) {
          const offset = new THREE.Vector3(
            position.x - (geom.center ? geom.center[0] : 0),
            position.y - (geom.center ? geom.center[1] : 0),
            position.z - (geom.center ? geom.center[2] : 0)
          );
          
          geom.vertices = geom.vertices.map(vertex => [
            vertex[0] + offset.x,
            vertex[1] + offset.y,
            vertex[2] + offset.z
          ]);
        }
        
        // 更新されたgeometryを設定
        updatedObject.geometry = [geom];
      }
      
      setSelectedObject(updatedObject);
    }
  };

  // クリックハンドラー
  const handleClick = (event) => {
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

    // 前回の選択ハイライトを解除
    if (selectedMeshRef.current) {
      selectedMeshRef.current.material.emissive.setHex(0x000000);
      selectedMeshRef.current.material.emissiveIntensity = 0;
      selectedMeshRef.current.material.transparent = false;
      selectedMeshRef.current.material.opacity = 1.0;
      selectedMeshRef.current.material.depthWrite = true; // 深度書き込みを有効に戻す
    }

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      if (clickedObject.userData.objectData) {
        setSelectedObject(clickedObject.userData.objectData);
        selectedMeshRef.current = clickedObject;

        // 選択ハイライト: 白色の強い発光 + 強力な透明度調整
        clickedObject.material.emissive.setHex(0xffffff); // 白色
        clickedObject.material.emissiveIntensity = 0.7;
        clickedObject.material.transparent = true;
        clickedObject.material.opacity = 0.1; // 10%の不透明度（90%透明）
        clickedObject.material.depthWrite = false; // 深度書き込みを無効にして透明効果を強化
      }
    } else {
      // オブジェクト以外をクリックしても選択状態は維持
      // setSelectedObject(null); // この行をコメントアウト
      // selectedMeshRef.current = null; // この行もコメントアウト
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
    
    // 背景をSkyに変更（nullで透明に）
    scene.background = null;

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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const skyComponent = new SkyComponent(scene, renderer, mountRef.current);
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
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
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

    // 床（固定地表面 - ライトグレー）
    const floorGeometry = new THREE.PlaneGeometry(10000, 10000);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#D3D3D3',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // 水平に配置
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

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
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
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

      // カメラ移動時の処理（ターゲットは固定のまま）

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

      // 7: 管路表示トグル
      if (keysPressed.current['7']) {
        setShowPipes((prev) => !prev);
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

      // ESC: 管路情報表示をクリア
      if (keysPressed.current['escape']) {
        setSelectedObject(null);
        selectedMeshRef.current = null;
        keysPressed.current['escape'] = false;
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

      // レイキャスティングでホバー検出
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(
        Object.values(objectsRef.current),
        false
      );

      // 前回ホバーしていたオブジェクトをリセット（選択中は除外）
      if (hoveredObjectRef.current) {
        if (hoveredObjectRef.current !== selectedMeshRef.current) {
          hoveredObjectRef.current.material.emissive.setHex(0x000000);
          hoveredObjectRef.current.material.emissiveIntensity = 0;
        }
        document.body.style.cursor = 'default';
        hoveredObjectRef.current = null;
      }

      // 新しくホバーしたオブジェクトを設定（選択中は除外）
      if (intersects.length > 0) {
        const hoveredObject = intersects[0].object;
        if (hoveredObject !== selectedMeshRef.current) {
          hoveredObject.material.emissive.setHex(
            new THREE.Color(hoveredObject.userData.originalColor).getHex()
          );
          hoveredObject.material.emissiveIntensity = 0.3;
        }
        document.body.style.cursor = 'pointer';
        hoveredObjectRef.current = hoveredObject;
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

      renderer.render(scene, camera);
    };
    animate();

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', handleMouseMove);
        mountRef.current.removeEventListener('mousedown', handleMouseDown);
        mountRef.current.removeEventListener('mouseup', handleMouseUp);
        mountRef.current.removeEventListener('click', handleClick);
        if (renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      }
      skyComponent.dispose();
      controls.dispose();
      renderer.dispose();
    };
  // }, [onCameraMove, onObjectClick]);
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
      }
    });

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
          mesh.visible = showPipes && mesh.userData.initialVisible !== false;
        }
      }
    });
  }, [showPipes]);

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


  return (
    <div className="scene3d-container">
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {/* 左上の管路情報 */}
      {showGuides && (
        <div className="pipeline-info-text">
          ◆管路情報<br />
          左クリック: 管路情報を表示します<br />
          ESCキー: 管路情報表示をクリア<br />
          ◆離隔計測<br />
          左Shift+左ドラッグ: 管路間の最近接距離を計測します 中クリック:地表面で折れ線の長さを計測します。<br />
          ESCキー: 離隔をクリア<br />
          ◆表示切り替え<br />
          1: ガイド 2: 背景 5:離隔 6: 折れ線 7: 管路 8: 路面 9: 地表面<br/> 
          Space: 透視投影・正射投影 マウスホイール: 拡大縮小 +左Ctrlキー: 低速<br />
          ◆離隔計測結果
          {/* 選択された管路情報を表示 */}
          {selectedObject && <PipelineInfoDisplay selectedObject={selectedObject} shapeTypes={shapeTypes} />}
        </div>
      )}
      
      {/* 左下のカメラ情報 */}
      {showGuides && (
        <div className="camera-info-container">
          <div className="camera-position-info">
            ◆カメラ位置<br />
            座標: 東西 {cameraInfo.x.toFixed(3)} 高さ {cameraInfo.y.toFixed(3)} 南北 {cameraInfo.z.toFixed(3)} [m]<br/> 
            向き:ロール {cameraInfo.roll} ピッチ {cameraInfo.pitch} ヨー {cameraInfo.yaw} [度]
          </div>
          <div className="camera-controls-info">
            ◆カメラ操作<br />
            W: 上 S:下 A:左 D:右 Q:後進 E:前進 +左Shiftキー:低速（キー・マウス両方） <br/>
            Y:位置向き初期化 P:向き初期化 O:位置初期化<br/> 
            L:パン北向き I:チルト水平 T:チルト真下 R:チルト水平・高さ初期値<br/> 
            U:パン重心 J:位置重心 H:重心向き後進 G:重心向き前進 K:重心真下
          </div>
        </div>
      )}
    </div>
  );
}

export default Scene3D;

