import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import SkyComponent from './SkyComponent';
import PipelineInfoDisplay from './PipelineInfoDisplay';
import InfiniteGridHelper from './InfiniteGridHelper';
import './Scene3D.css';

function Scene3D({ cityJsonData, visibleLayers, onObjectClick, onCameraMove }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const objectsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const hoveredObjectRef = useRef(null);
  const keysPressed = useRef({});
  const cameraVelocity = useRef(new THREE.Vector3());
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

  // レイヤー判定関数
  const getLayerFromObject = (obj) => {
    const name = obj.attributes?.name || '';
    if (name.includes('水道')) return 'water';
    if (name.includes('下水道')) return 'sewer';
    if (name.includes('電')) return 'electric';
    if (name.includes('ガス')) return 'gas';
    if (name.includes('接続')) return 'junction';
    if (name.includes('制御')) return 'control';
    return 'other';
  };

  // 3Dオブジェクトの作成
  const createCityObject = (obj) => {
    let geometry;
    const geom = obj.geometry?.[0];
    if (!geom) return null;
    
    // ジオメトリタイプに基づいてThree.jsオブジェクトを作成
    switch (geom.type) {
      case 'Point':
      case 'MultiPoint':
        geometry = new THREE.SphereGeometry(0.2, 16, 16);
        break;
      case 'LineString':
      case 'MultiLineString':
      case 'Arc':
      case 'Spline':
        // 線は後で処理
        geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        break;
      case 'Circle':
        geometry = new THREE.SphereGeometry(geom.radius || 0.5, 32, 32);
        break;
      case 'Sphere':
        geometry = new THREE.SphereGeometry(geom.radius || 0.5, 32, 32);
        break;
      case 'Cylinder':
        const start = geom.start || [0, 0, 0];
        const end = geom.end || [0, 1, 0];
        const height = Math.sqrt(
          Math.pow(end[0] - start[0], 2) +
          Math.pow(end[1] - start[1], 2) +
          Math.pow(end[2] - start[2], 2)
        );
        geometry = new THREE.CylinderGeometry(geom.radius || 0.3, geom.radius || 0.3, height, 32);
        break;
      case 'Box':
      case 'Rectangle':
      case 'Cube':
        const w = geom.width || geom.size || 1;
        const h = geom.height || geom.size || 1;
        const d = geom.depth || geom.size || 1;
        geometry = new THREE.BoxGeometry(w, h, d);
        break;
      case 'Cone':
        geometry = new THREE.ConeGeometry(geom.base_radius || 0.5, 1, 32);
        break;
      case 'Torus':
        geometry = new THREE.TorusGeometry(geom.major_radius || 0.6, geom.minor_radius || 0.2, 16, 100);
        break;
      default:
        geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    // 色をpipe_kindに基づいて決定
    const pipeKind = obj.attributes?.pipe_kind || '';
    let color = '#888888';
    if (pipeKind.includes('測量')) color = '#2196F3';
    else if (pipeKind.includes('境界') || pipeKind.includes('線')) color = '#FFC107';
    else if (pipeKind.includes('管')) color = '#4CAF50';
    else if (pipeKind.includes('枠')) color = '#9C27B0';
    else if (pipeKind.includes('ジョイント')) color = '#FF5722';

    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.3,
      roughness: 0.7
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // 位置を設定
    const center = geom.center || geom.start || geom.vertices?.[0] || [0, 0, 0];
    mesh.position.set(center[0], center[1], center[2]);
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { objectData: obj, originalColor: color };

    return mesh;
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

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      if (clickedObject.userData.objectData) {
        // setSelectedObject(clickedObject.userData.objectData); // 選択されたオブジェクトを設定
        // if (onObjectClick) {
        //   onObjectClick(clickedObject.userData.objectData);
        // }
        setSelectedObject(clickedObject.userData.objectData);
      }
    } else {
      setSelectedObject(null); // オブジェクト以外をクリックした場合はクリア
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

    // Sky コンポーネントの初期化（コンテナを渡す）
    const skyComponent = new SkyComponent(scene, renderer, mountRef.current);

    // マウスドラッグでカメラ回転
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (event) => {
      if (event.button === 2) { // 右クリック
        isDragging = true;
        previousMousePosition = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseMove = (event) => {
      if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        camera.rotation.y -= deltaX * 0.005;
        camera.rotation.x -= deltaY * 0.005;

        // X軸の回転を制限（真上・真下を見すぎない）
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

        previousMousePosition = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

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

      // キーボード操作でカメラ移動
      const speed = keysPressed.current['shift'] ? 0.1 : 0.5; // Shiftで低速
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);

      // W:上 S:下
      if (keysPressed.current['w']) camera.position.add(up.clone().multiplyScalar(speed));
      if (keysPressed.current['s']) camera.position.add(up.clone().multiplyScalar(-speed));

      // A:左 D:右
      if (keysPressed.current['a']) camera.position.add(right.clone().multiplyScalar(-speed));
      if (keysPressed.current['d']) camera.position.add(right.clone().multiplyScalar(speed));

      // Q:後進 E:前進
      if (keysPressed.current['q']) camera.position.add(forward.clone().multiplyScalar(-speed));
      if (keysPressed.current['e']) camera.position.add(forward.clone().multiplyScalar(speed));

      // Y:位置向き初期化
      if (keysPressed.current['y']) {
        camera.position.copy(initialCameraPosition.current);
        camera.rotation.copy(initialCameraRotation.current);
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

      // 前回ホバーしていたオブジェクトをリセット
      if (hoveredObjectRef.current) {
        hoveredObjectRef.current.material.emissive.setHex(0x000000);
        hoveredObjectRef.current.scale.copy(hoveredObjectRef.current.userData.originalScale);
        document.body.style.cursor = 'default';
        hoveredObjectRef.current = null;
      }

      // 新しくホバーしたオブジェクトを設定
      if (intersects.length > 0) {
        const hoveredObject = intersects[0].object;
        if (!hoveredObject.userData.originalScale) {
          hoveredObject.userData.originalScale = hoveredObject.scale.clone();
        }
        hoveredObject.material.emissive.setHex(
          new THREE.Color(hoveredObject.userData.originalColor).getHex()
        );
        hoveredObject.material.emissiveIntensity = 0.3;
        hoveredObject.scale.multiplyScalar(1.05);
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
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
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

    // 新しいオブジェクトを追加
    const pipes = cityJsonData.CityObjects?.pipes || cityJsonData.objects || [];
    pipes.forEach(obj => {
      const mesh = createCityObject(obj);
      if (mesh) {
        sceneRef.current.add(mesh);
        objectsRef.current[obj.id] = mesh;
      }
    });
  }, [cityJsonData]);

  // レイヤーの可視性を更新
  useEffect(() => {
    if (!cityJsonData || Object.keys(objectsRef.current).length === 0) return;

    const pipes = cityJsonData.CityObjects?.pipes || cityJsonData.objects || [];
    pipes.forEach(obj => {
      const layer = getLayerFromObject(obj);
      const isVisible = visibleLayers[layer] !== false;
      const mesh = objectsRef.current[obj.id];
      
      if (mesh) {
        mesh.visible = isVisible;
      }
    });
  }, [visibleLayers, cityJsonData]);

  return (
    <div className="scene3d-container">
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {/* 左上の管路情報 */}
      <div className="pipeline-info-text">
        ◆管路情報<br />
        左クリック: 管路情報を表示します<br />
        ◆離隔計測<br />
        左Shift+左ドラッグ: 管路間の最近接距離を計測します 中クリック:地表面で折れ線の長さを計測します。<br />
        ESCキー: 離隔をクリア<br />
        ◆表示切り替え<br />
        1: ガイド 2: 背景 5:離隔6: 折れ線 7: 管路8:路面9:地表面<br/> 
        Space: 透視投影・正射投影 マウスホイール: 拡大縮小 +左Ctrlキー: 低速<br />
        ◆離隔計測結果
        {/* 選択された管路情報を表示 */}
        <PipelineInfoDisplay selectedObject={selectedObject} />
      </div>
      
      {/* 左下のカメラ情報 */}
      <div className="camera-info-container">
        <div className="camera-position-info">
          ◆カメラ位置<br />
          座標: 東西 {cameraInfo.x.toFixed(3)} 高さ {cameraInfo.y.toFixed(3)} 南北 {cameraInfo.z.toFixed(3)} [m]<br/> 
          向き:ロール {cameraInfo.roll} ピッチ {cameraInfo.pitch} ヨー {cameraInfo.yaw} [度]
        </div>
        <div className="camera-controls-info">
          ◆カメラ操作<br />
          W: 上 S:下 A:左 D:右 Q:後進 E:前進 右ドラッグ: 向き +左Shiftキー:低速 <br/>
          Y:位置向き初期化 P:向き初期化 O:位置初期化<br/> 
          L:パン北向き I:チルト水平 T:チルト真下 R:チルト水平・高さ初期値<br/> 
          U:パン重心 J:位置重心 H:重心向き後進 G:重心向き前進 K:重心真下
        </div>
      </div>
    </div>
  );
}

export default Scene3D;

