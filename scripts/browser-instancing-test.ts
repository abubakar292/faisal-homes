import * as THREE from 'three';
import { getHouseGeometries, OBLIQUE_SHEAR_MATRIX } from '../src/features/plotMap3d/houseModels';

export async function runInstancingTest() {
  const width = 1200;
  const height = 800;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);

  const camera = new THREE.OrthographicCamera(0, width, 0, height, -1000, 1000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.matrix.copy(OBLIQUE_SHEAR_MATRIX);
  group.matrixAutoUpdate = false;
  scene.add(group);

  const geometries = getHouseGeometries();
  const houseMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const shadowGeom = new THREE.PlaneGeometry(1.4, 1.2);
  const shadowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });

  const totalItems = 1000;
  const itemsPerVariant = Math.ceil(totalItems / 12);

  for (let s = 0; s < 3; s++) {
    for (let p = 0; p < 4; p++) {
      const geom = geometries[s][p];
      const mesh = new THREE.InstancedMesh(geom, houseMat, itemsPerVariant);
      mesh.count = itemsPerVariant;
      const dummy = new THREE.Matrix4();
      for (let j = 0; j < itemsPerVariant; j++) {
        dummy.makeTranslation((j % 30) * 35 + 20, Math.floor(j / 30) * 35 + 20, 0);
        mesh.setMatrixAt(j, dummy);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
  }

  const shadowMesh = new THREE.InstancedMesh(shadowGeom, shadowMat, totalItems);
  shadowMesh.count = totalItems;
  group.add(shadowMesh);

  renderer.render(scene, camera);

  const calls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;

  const memBefore = {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };

  // 50 mount / unmount cycles
  for (let cycle = 0; cycle < 50; cycle++) {
    const tempGeoms = [];
    for (let i = 0; i < 12; i++) {
      tempGeoms.push(new THREE.BoxGeometry(1, 1, 1));
    }
    const tempTex = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
    tempTex.needsUpdate = true;

    for (const g of tempGeoms) g.dispose();
    tempTex.dispose();
  }

  const memAfter = {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };

  renderer.dispose();
  canvas.remove();

  return { calls, triangles, memBefore, memAfter };
}

// Attach to window for playwright
(window as any).__runInstancingTest = runInstancingTest;
