function renderThreeScene() {
  while(walls3DGroup.children.length) walls3DGroup.remove(walls3DGroup.children[0]);
  while(openings3DGroup.children.length) openings3DGroup.remove(openings3DGroup.children[0]);
  while(gridPoints3DGroup.children.length) gridPoints3DGroup.remove(gridPoints3DGroup.children[0]);
  
  const cx = (CANVAS_COLS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  const cz = (CANVAS_ROWS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  
  function gridToWorld(col, row) {
    return {
      x: col * MODULE_SIZE / 1000 - cx,
      z: (CANVAS_ROWS - row) * MODULE_SIZE / 1000 - cz
    };
  }
  
  // Grid points
  const pointGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x28a745 });
  gridPoints.forEach(p => {
    const pos = gridToWorld(p.gridData.col, p.gridData.row);
    const mesh = new THREE.Mesh(pointGeo, pointMat.clone());
    mesh.position.set(pos.x, 0, pos.z);
    gridPoints3DGroup.add(mesh);
  });
  
  // Walls
  walls.forEach((wall, wallIdx) => {
    const start = gridToWorld(wall.pointA.col, wall.pointA.row);
    const end = gridToWorld(wall.pointB.col, wall.pointB.row);
    
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    
    const wallMat = new THREE.MeshPhongMaterial({
      color: wall.mode === 'exterior' ? 0x6d4aff : 0x4fc3f7,
      side: THREE.DoubleSide
    });
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, WALL_HEIGHT_M, 0.15),
      wallMat
    );
    wallMesh.position.set(
      (start.x + end.x) / 2,
      WALL_HEIGHT_M / 2,
      (start.z + end.z) / 2
    );
    wallMesh.rotation.y = -angle;
    wallMesh.castShadow = true;
    walls3DGroup.add(wallMesh);
    
    // Openings - RENDER BOTH DOORS AND WINDOWS PROPERLY
    openings.filter(o => o.wallIndex === wallIdx).forEach(opening => {
      const ratio = opening.position;
      const ox = start.x + (end.x - start.x) * ratio;
      const oz = start.z + (end.z - start.z) * ratio;
      
      const openingHeight = opening.type === 'door' ? 2.1 : 1.4;
      const openingDepth = 0.16; // Same as wall thickness
      
      let openingMat, openingColor;
      
      if (opening.type === 'door') {
        // Doors: Solid wood color, visible from both sides
        openingColor = 0xff9800;
        openingMat = new THREE.MeshPhongMaterial({
          color: openingColor,
          side: THREE.DoubleSide
        });
      } else {
        // Windows: Glass-like, transparent but visible
        openingColor = 0x88ccff;
        openingMat = new THREE.MeshPhongMaterial({
          color: openingColor,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          shininess: 80,
          specular: 0x444444
        });
      }
      
      const openingMesh = new THREE.Mesh(
        new THREE.BoxGeometry(opening.width, openingHeight, openingDepth),
        openingMat
      );
      openingMesh.position.set(
        ox,
        opening.type === 'door' ? openingHeight / 2 : WALL_HEIGHT_M / 2,
        oz
      );
      openingMesh.rotation.y = -angle;
      // Remove Z-offset - let openings sit flush with wall
      openings3DGroup.add(openingMesh);
    });
  });
  
  animate();
}
