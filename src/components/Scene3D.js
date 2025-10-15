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
    if ((shapeTypeName === 'Cylinder' && geom.type === 'LineString') || shapeTypeName === 'LineString') {
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
          startPoint = new THREE.Vector3(start[0], startDepth, start[1]);
          endPoint = new THREE.Vector3(end[0], endDepth, end[1]);
        } else {
          startPoint = new THREE.Vector3(start[0], start[1], start[2]);
          endPoint = new THREE.Vector3(end[0], end[1], end[2]);
        }

        // 円柱の高さと方向を計算
        const height = startPoint.distanceTo(endPoint);
        let radius = (obj.attributes?.radius != null) ? Number(obj.attributes.radius) : 0.3;
        if (radius > 5) radius = radius / 1000;
        radius = Math.max(radius, 0.05);
        
        geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        
        // 円柱を正しい方向に回転
        const direction = endPoint.clone().sub(startPoint).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        geometry.applyQuaternion(quaternion);
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
        case 'Cylinder': {
          const start = geom.start || [0, 0, 0];
          const end = geom.end || [0, 1, 0];
          const height = Math.sqrt(
            Math.pow(end[0] - start[0], 2) +
            Math.pow(end[1] - start[1], 2) +
            Math.pow(end[2] - start[2], 2)
          );
          const r = (obj.attributes?.radius != null) ? Number(obj.attributes.radius) : (geom.radius || 0.3);
          geometry = new THREE.CylinderGeometry(r, r, height, 32);
          break;
        }
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
    if ((shapeTypeName === 'Cylinder' && geom.type === 'LineString') || shapeTypeName === 'LineString') {
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
          startPoint = new THREE.Vector3(start[0], startDepth, start[1]);
          endPoint = new THREE.Vector3(end[0], endDepth, end[1]);
        } else {
          startPoint = new THREE.Vector3(start[0], start[1], start[2]);
          endPoint = new THREE.Vector3(end[0], end[1], end[2]);
        }
        
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
  };

  // クリックハンドラー
  const handleClick = (event) => {
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
      setSelectedObject(null); // オブジェクト以外をクリックした場合はクリア
      selectedMeshRef.current = null;
    }
  };

  // キーボード操作
  const handleKeyDown = (event) => {
    keysPressed.current[event.key.toLowerCase()] = true;
  };

  const handleKeyUp = (event) => {
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    
    // ターゲットの制約を緩和して自由なカメラ移動を実現
    controls.target.set(0, 0, 0); // 初期ターゲット
    controls.maxDistance = Infinity; // 最大距離制限を解除
    controls.minDistance = 0.1;     // 最小距離制限を設定
    controls.maxPolarAngle = Math.PI; // 垂直回転制限を解除（上下360度回転可能）
    controls.minPolarAngle = 0;      // 垂直回転制限を解除
    
    // マウス操作の割当を入れ替え: 左ドラッグ=パン、右ドラッグ=回転
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    
    // 操作速度を調整
    controls.panSpeed = 2.0;      // パン速度を上げる
    controls.rotateSpeed = 1.0;   // 回転速度
    controls.zoomSpeed = 1.0;     // ズーム速度
    controls.keyPanSpeed = 7.0;   // キーボードパン速度
    controls.keyRotateSpeed = 2.0; // キーボード回転速度
    controlsRef.current = controls;

    // Sky コンポーネントの初期化（コンテナを渡す）
    const skyComponent = new SkyComponent(scene, renderer, mountRef.current);
    skyComponentRef.current = skyComponent;

    // 初期カメラは props.userPositions から設定（App 側でフェッチ済み）
    if (userPositions) {
      const regionXY = parsePointWkt(userPositions.reqion_position);
      const height = Number(userPositions.reqion_hight);
      const yawDeg = Number(userPositions.yaw);
      const pitchDeg = Number(userPositions.pitch);
      const rollDeg = Number(userPositions.roll);

      if (regionXY && Number.isFinite(height)) {
        camera.position.set(regionXY.x, height, regionXY.y);
      }

      if ([yawDeg, pitchDeg, rollDeg].some((v) => Number.isFinite(v))) {
        const yaw = THREE.MathUtils.degToRad(Number.isFinite(yawDeg) ? yawDeg : 0);
        const pitch = THREE.MathUtils.degToRad(Number.isFinite(pitchDeg) ? pitchDeg : 0);
        const roll = THREE.MathUtils.degToRad(Number.isFinite(rollDeg) ? rollDeg : 0);
        camera.rotation.set(pitch, yaw, roll, 'XYZ');
      }

      initialCameraPosition.current.copy(camera.position);
      initialCameraRotation.current.copy(camera.rotation);
      previousCameraPosition.current.copy(camera.position);
      previousCameraRotation.current.copy(camera.rotation);

      setCameraInfo({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        roll: (Number.isFinite(rollDeg) ? rollDeg : 0).toFixed(1),
        pitch: (Number.isFinite(pitchDeg) ? pitchDeg : 0).toFixed(1),
        yaw: (Number.isFinite(yawDeg) ? yawDeg : 0).toFixed(1)
      });
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

    // 床（無限地表面 - lightgrey）
    const infiniteGrid = new InfiniteGridHelper(new THREE.Color('lightgrey'), 10000);
    infiniteGrid.position.y = 0;
    scene.add(infiniteGrid);
    floorRef.current = infiniteGrid;

    // イベントリスナー
    mountRef.current.addEventListener('mousemove', handleMouseMove);
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
        controls.panSpeed = 0.5;
        controls.rotateSpeed = 0.5;
        controls.zoomSpeed = 0.5;
      } else {
        controls.panSpeed = 1.0;
        controls.rotateSpeed = 1.0;
        controls.zoomSpeed = 1.0;
      }

      // OrbitControlsの更新
      controls.update();

      // キーボード操作でカメラ移動
      const speed = keysPressed.current['shift'] ? 0.1 : 0.5; // Shiftで低速
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
        Math.abs(camera.rotation.x - previousCameraRotation.current.x) > 0.001 ||
        Math.abs(camera.rotation.y - previousCameraRotation.current.y) > 0.001 ||
        Math.abs(camera.rotation.z - previousCameraRotation.current.z) > 0.001;
      
      if (positionChanged || rotationChanged) {
        const radToDeg = (rad) => ((rad * 180 / Math.PI) % 360).toFixed(1);
        setCameraInfo({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          roll: radToDeg(camera.rotation.z),
          pitch: radToDeg(camera.rotation.x),
          yaw: radToDeg(camera.rotation.y)
        });
        
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
  }, []);

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
    if (userPositions) {
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
          (obj.geometry?.[0]?.type === 'LineString') // LineString
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
          ◆離隔計測<br />
          左Shift+左ドラッグ: 管路間の最近接距離を計測します 中クリック:地表面で折れ線の長さを計測します。<br />
          ESCキー: 離隔をクリア<br />
          ◆表示切り替え<br />
          1: ガイド 2: 背景 5:離隔 6: 折れ線 7: 管路 8: 路面 9: 地表面<br/> 
          Space: 透視投影・正射投影 マウスホイール: 拡大縮小 +左Ctrlキー: 低速<br />
          ◆離隔計測結果
          {/* 選択された管路情報を表示 */}
          <PipelineInfoDisplay selectedObject={selectedObject} />
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
            マウス左ドラッグ: パン マウス右ドラッグ: 向き（回転） マウスホイール: ズーム<br/>
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

