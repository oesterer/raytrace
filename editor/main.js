import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

const viewport = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, viewport.clientWidth / viewport.clientHeight, 0.1, 2000);
camera.position.set(8, 6, 8);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.05;
orbit.target.set(0, 1, 0);

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode("translate");
transform.addEventListener("change", render);
transform.addEventListener("dragging-changed", (event) => {
    orbit.enabled = !event.value;
});
transform.addEventListener("objectChange", () => {
    if (selectedEntity) {
        updateEntityFromTransform(selectedEntity);
        refreshEntityForm();
        refreshSceneJson();
    }
});
scene.add(transform);

const grid = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
scene.add(grid);

const axes = new THREE.AxesHelper(2);
scene.add(axes);

const ambientPreview = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientPreview);

const entities = [];
let selectedEntity = null;
let idCounter = 1;

const objectList = document.getElementById("object-list");
const entityEditor = document.getElementById("entity-editor");
const entityForm = document.getElementById("entity-form");
const deleteButton = document.getElementById("delete-entity");
const sceneJsonText = document.getElementById("scene-json");

const cameraForm = document.getElementById("camera-form");
const transformRadioButtons = document.querySelectorAll("input[name='transform']");

const cameraState = {
    position: new THREE.Vector3().copy(camera.position),
    lookAt: new THREE.Vector3().copy(orbit.target),
    up: new THREE.Vector3().copy(camera.up),
    fov: camera.fov,
    width: 640,
    height: 480,
};

window.addEventListener("resize", () => {
    const { clientWidth, clientHeight } = viewport;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    render();
});

function render() {
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    render();
}

animate();

function generateId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

function createSphereEntity() {
    const radius = 1;
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.6, metalness: 0.0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.position.set(0, radius, 0);
    scene.add(mesh);

    const entity = {
        id: generateId("sphere"),
        label: "Sphere",
        kind: "sphere",
        mesh,
        data: {
            center: mesh.position.clone(),
            radius,
            color: { r: 0.533, g: 0.8, b: 1.0 },
        },
    };
    entities.push(entity);
    addListItem(entity);
    selectEntity(entity.id);
    refreshSceneJson();
}

function createCubeEntity() {
    const size = 1.5;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({ color: 0xffc164, roughness: 0.6, metalness: 0.0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, size / 2, 0);
    scene.add(mesh);

    const entity = {
        id: generateId("cube"),
        label: "Cube",
        kind: "cube",
        mesh,
        data: {
            center: mesh.position.clone(),
            size: { x: size, y: size, z: size },
            color: { r: 1.0, g: 0.761, b: 0.392 },
        },
    };
    entities.push(entity);
    addListItem(entity);
    selectEntity(entity.id);
    refreshSceneJson();
}

function createLightEntity() {
    const sphereGeom = new THREE.SphereGeometry(0.12, 16, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const marker = new THREE.Mesh(sphereGeom, sphereMat);
    marker.position.set(0, 0, 0);

    const point = new THREE.PointLight(0xffffff, 1.5, 0, 2);
    point.position.set(0, 0, 0);

    const group = new THREE.Group();
    group.add(marker);
    group.add(point);
    group.position.set(3, 5, 3);
    scene.add(group);

    const entity = {
        id: generateId("light"),
        label: "Point Light",
        kind: "light",
        mesh: group,
        helper: marker,
        light: point,
        data: {
            position: group.position.clone(),
            intensity: { r: 1.0, g: 1.0, b: 1.0 },
            direction: { x: 0.0, y: -1.0, z: 0.0 },
        },
    };
    entities.push(entity);
    addListItem(entity);
    selectEntity(entity.id);
    refreshSceneJson();
}

function addListItem(entity) {
    const option = document.createElement("option");
    option.value = entity.id;
    option.textContent = `${entity.label} (${entity.id})`;
    objectList.appendChild(option);
    objectList.value = entity.id;
}

function removeEntity(entity) {
    const index = entities.indexOf(entity);
    if (index >= 0) {
        entities.splice(index, 1);
    }

    if (entity.mesh) {
        scene.remove(entity.mesh);
        disposeObject(entity.mesh);
    }

    for (const option of Array.from(objectList.options)) {
        if (option.value === entity.id) {
            option.remove();
        }
    }

    if (selectedEntity && selectedEntity.id === entity.id) {
        selectedEntity = null;
        transform.detach();
        entityEditor.hidden = true;
        objectList.value = "";
    }

    refreshSceneJson();
}

function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
        if (child.texture) {
            child.texture.dispose();
        }
    });
}

function selectEntity(id) {
    const entity = entities.find((e) => e.id === id);
    selectedEntity = entity || null;
    if (!entity) {
        transform.detach();
        entityEditor.hidden = true;
        objectList.value = "";
        render();
        return;
    }

    objectList.value = entity.id;
    entityEditor.hidden = false;
    refreshEntityForm();

    if (entity.mesh) {
        transform.attach(entity.mesh);
    } else {
        transform.detach();
    }
    render();
}

function refreshEntityForm() {
    entityForm.innerHTML = "";
    if (!selectedEntity) {
        entityEditor.hidden = true;
        return;
    }

    const entity = selectedEntity;

    const positionGroup = createPropertyGroup("Position", [
        createNumberField("X", entity.mesh.position.x, (value) => setEntityPosition(axisUpdater("x", value))),
        createNumberField("Y", entity.mesh.position.y, (value) => setEntityPosition(axisUpdater("y", value))),
        createNumberField("Z", entity.mesh.position.z, (value) => setEntityPosition(axisUpdater("z", value))),
    ]);
    entityForm.appendChild(positionGroup);

    if (entity.kind === "sphere") {
        const radiusGroup = createPropertyGroup("Sphere", [
            createNumberField("Radius", entity.data.radius, (value) => {
                entity.data.radius = Math.max(0.1, value);
                const uniformScale = entity.data.radius / 1.0;
                entity.mesh.scale.set(uniformScale, uniformScale, uniformScale);
                entity.mesh.position.y = entity.data.center.y;
                refreshSceneJson();
            }, 0.1),
        ]);
        const colorGroup = createPropertyGroup("Color", [
            createColorField("Color", colorToHex(entity.data.color), (hex) => {
                entity.data.color = hexToColor(hex);
                entity.mesh.material.color = new THREE.Color(hex);
                refreshSceneJson();
            }),
        ]);
        entityForm.appendChild(radiusGroup);
        entityForm.appendChild(colorGroup);
    } else if (entity.kind === "cube") {
        const sizeGroup = createPropertyGroup("Dimensions", [
            createNumberField("Width", entity.data.size.x, (value) => {
                entity.data.size.x = Math.max(0.1, value);
                entity.mesh.scale.x = entity.data.size.x / entity.mesh.geometry.parameters.width;
                refreshSceneJson();
            }, 0.1),
            createNumberField("Height", entity.data.size.y, (value) => {
                entity.data.size.y = Math.max(0.1, value);
                entity.mesh.scale.y = entity.data.size.y / entity.mesh.geometry.parameters.height;
                refreshSceneJson();
            }, 0.1),
            createNumberField("Depth", entity.data.size.z, (value) => {
                entity.data.size.z = Math.max(0.1, value);
                entity.mesh.scale.z = entity.data.size.z / entity.mesh.geometry.parameters.depth;
                refreshSceneJson();
            }, 0.1),
        ]);
        const colorGroup = createPropertyGroup("Color", [
            createColorField("Color", colorToHex(entity.data.color), (hex) => {
                entity.data.color = hexToColor(hex);
                entity.mesh.material.color = new THREE.Color(hex);
                refreshSceneJson();
            }),
        ]);
        entityForm.appendChild(sizeGroup);
        entityForm.appendChild(colorGroup);
    } else if (entity.kind === "light") {
        const intensityGroup = createPropertyGroup("Intensity", [
            createNumberField("R", entity.data.intensity.r, (value) => {
                entity.data.intensity.r = Math.max(0, value);
                entity.light.color.setRGB(entity.data.intensity.r, entity.data.intensity.g, entity.data.intensity.b);
                refreshSceneJson();
            }, 0.1),
            createNumberField("G", entity.data.intensity.g, (value) => {
                entity.data.intensity.g = Math.max(0, value);
                entity.light.color.setRGB(entity.data.intensity.r, entity.data.intensity.g, entity.data.intensity.b);
                refreshSceneJson();
            }, 0.1),
            createNumberField("B", entity.data.intensity.b, (value) => {
                entity.data.intensity.b = Math.max(0, value);
                entity.light.color.setRGB(entity.data.intensity.r, entity.data.intensity.g, entity.data.intensity.b);
                refreshSceneJson();
            }, 0.1),
        ]);
        const directionGroup = createPropertyGroup("Direction", [
            createNumberField("X", entity.data.direction.x, (value) => {
                entity.data.direction.x = value;
                refreshSceneJson();
            }, 0.1),
            createNumberField("Y", entity.data.direction.y, (value) => {
                entity.data.direction.y = value;
                refreshSceneJson();
            }, 0.1),
            createNumberField("Z", entity.data.direction.z, (value) => {
                entity.data.direction.z = value;
                refreshSceneJson();
            }, 0.1),
        ]);
        entityForm.appendChild(intensityGroup);
        entityForm.appendChild(directionGroup);
    }
}

function axisUpdater(axis, value) {
    return (vector) => {
        vector[axis] = value;
        return vector;
    };
}

function setEntityPosition(updateFn) {
    if (!selectedEntity) {
        return;
    }
    const vector = selectedEntity.mesh.position.clone();
    const updated = updateFn(vector);
    selectedEntity.mesh.position.copy(updated);
    if (selectedEntity.kind === "sphere") {
        selectedEntity.data.center = selectedEntity.mesh.position.clone();
    } else if (selectedEntity.kind === "cube") {
        selectedEntity.data.center = selectedEntity.mesh.position.clone();
    } else if (selectedEntity.kind === "light") {
        selectedEntity.light.position.set(0, 0, 0);
        selectedEntity.helper.position.set(0, 0, 0);
        selectedEntity.data.position = selectedEntity.mesh.position.clone();
    }
    refreshSceneJson();
    render();
}

function updateEntityFromTransform(entity) {
    if (entity.kind === "light") {
        entity.data.position = entity.mesh.position.clone();
    } else {
        entity.data.center = entity.mesh.position.clone();
    }
}

function createPropertyGroup(title, fields) {
    const wrapper = document.createElement("div");
    wrapper.className = "property-group";

    const heading = document.createElement("h2");
    heading.textContent = title;
    wrapper.appendChild(heading);

    const container = document.createElement("div");
    container.className = "field-group";
    fields.forEach((field) => container.appendChild(field));
    wrapper.appendChild(container);

    return wrapper;
}

function createNumberField(labelText, value, onChange, step = 0.01) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        input.value = numericValue.toFixed(step < 1 ? 3 : 2);
    } else {
        input.value = step < 1 ? "0.000" : "0.00";
    }
    input.addEventListener("change", () => {
        const parsed = parseFloat(input.value);
        if (!Number.isNaN(parsed)) {
            onChange(parsed);
        }
    });

    label.appendChild(input);
    return label;
}

function createColorField(labelText, value, onChange) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));

    label.appendChild(input);
    return label;
}

function colorToHex(color) {
    const r = Math.round(clamp01(color.r) * 255);
    const g = Math.round(clamp01(color.g) * 255);
    const b = Math.round(clamp01(color.b) * 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToColor(hex) {
    const value = parseInt(hex.slice(1), 16);
    return {
        r: ((value >> 16) & 255) / 255,
        g: ((value >> 8) & 255) / 255,
        b: (value & 255) / 255,
    };
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function refreshSceneJson() {
    const sceneDefinition = buildSceneJson();
    sceneJsonText.value = JSON.stringify(sceneDefinition, null, 2);
}

function buildSceneJson() {
    const objects = [];
    const lights = [];

    for (const entity of entities) {
        if (entity.kind === "sphere") {
            objects.push({
                type: "sphere",
                center: toArray(entity.data.center),
                radius: entity.data.radius,
                color: colorToArray(entity.data.color),
            });
        } else if (entity.kind === "cube") {
            const half = {
                x: entity.data.size.x / 2,
                y: entity.data.size.y / 2,
                z: entity.data.size.z / 2,
            };
            const center = entity.data.center;
            const min = [
                center.x - half.x,
                center.y - half.y,
                center.z - half.z,
            ];
            const max = [
                center.x + half.x,
                center.y + half.y,
                center.z + half.z,
            ];
            objects.push({
                type: "cube",
                min,
                max,
                color: colorToArray(entity.data.color),
            });
        } else if (entity.kind === "light") {
            lights.push({
                type: "point",
                position: toArray(entity.data.position),
                intensity: [
                    entity.data.intensity.r,
                    entity.data.intensity.g,
                    entity.data.intensity.b,
                ],
                direction: [
                    entity.data.direction.x,
                    entity.data.direction.y,
                    entity.data.direction.z,
                ],
            });
        }
    }

    return {
        camera: {
            position: [cameraState.position.x, cameraState.position.y, cameraState.position.z],
            look_at: [cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z],
            up: [cameraState.up.x, cameraState.up.y, cameraState.up.z],
            fov: cameraState.fov,
            width: cameraState.width,
            height: cameraState.height,
        },
        objects,
        lights,
    };
}

function toArray(vector) {
    return [vector.x, vector.y, vector.z];
}

function colorToArray(color) {
    return [color.r, color.g, color.b];
}

function updateCameraStateFromForm() {
    const formData = new FormData(cameraForm);
    cameraState.position.set(
        parseNumber(formData.get("posX"), cameraState.position.x),
        parseNumber(formData.get("posY"), cameraState.position.y),
        parseNumber(formData.get("posZ"), cameraState.position.z),
    );
    cameraState.lookAt.set(
        parseNumber(formData.get("lookX"), cameraState.lookAt.x),
        parseNumber(formData.get("lookY"), cameraState.lookAt.y),
        parseNumber(formData.get("lookZ"), cameraState.lookAt.z),
    );
    cameraState.up.set(
        parseNumber(formData.get("upX"), cameraState.up.x),
        parseNumber(formData.get("upY"), cameraState.up.y),
        parseNumber(formData.get("upZ"), cameraState.up.z),
    );
    cameraState.fov = parseNumber(formData.get("fov"), cameraState.fov);
    cameraState.width = Math.max(1, Math.round(parseNumber(formData.get("width"), cameraState.width)));
    cameraState.height = Math.max(1, Math.round(parseNumber(formData.get("height"), cameraState.height)));

    applyCameraStateToView();
    refreshSceneJson();
}

function applyCameraStateToView() {
    camera.position.copy(cameraState.position);
    camera.up.copy(cameraState.up);
    camera.fov = cameraState.fov;
    camera.updateProjectionMatrix();
    orbit.target.copy(cameraState.lookAt);
    orbit.update();
    render();
}

function populateCameraForm() {
    cameraForm.elements.posX.value = cameraState.position.x.toFixed(3);
    cameraForm.elements.posY.value = cameraState.position.y.toFixed(3);
    cameraForm.elements.posZ.value = cameraState.position.z.toFixed(3);
    cameraForm.elements.lookX.value = cameraState.lookAt.x.toFixed(3);
    cameraForm.elements.lookY.value = cameraState.lookAt.y.toFixed(3);
    cameraForm.elements.lookZ.value = cameraState.lookAt.z.toFixed(3);
    cameraForm.elements.upX.value = cameraState.up.x.toFixed(3);
    cameraForm.elements.upY.value = cameraState.up.y.toFixed(3);
    cameraForm.elements.upZ.value = cameraState.up.z.toFixed(3);
    cameraForm.elements.fov.value = cameraState.fov.toFixed(2);
    cameraForm.elements.width.value = cameraState.width;
    cameraForm.elements.height.value = cameraState.height;
}

populateCameraForm();
refreshSceneJson();

cameraForm.addEventListener("change", () => {
    updateCameraStateFromForm();
});

cameraForm.addEventListener("submit", (event) => event.preventDefault());

objectList.addEventListener("change", () => {
    selectEntity(objectList.value);
});

document.getElementById("add-sphere").addEventListener("click", createSphereEntity);
document.getElementById("add-cube").addEventListener("click", createCubeEntity);
document.getElementById("add-light").addEventListener("click", createLightEntity);

deleteButton.addEventListener("click", () => {
    if (!selectedEntity) {
        return;
    }
    const toRemove = selectedEntity;
    selectEntity(null);
    removeEntity(toRemove);
});

transformRadioButtons.forEach((radio) => {
    radio.addEventListener("change", () => {
        if (!selectedEntity) {
            return;
        }
        if (radio.checked) {
            if (radio.value === "translate") {
                transform.setMode("translate");
                transform.attach(selectedEntity.mesh);
            } else {
                transform.detach();
            }
            render();
        }
    });
});

document.getElementById("focus-origin").addEventListener("click", () => {
    orbit.target.set(0, 0, 0);
    cameraState.lookAt.copy(orbit.target);
    orbit.update();
    refreshSceneJson();
});

const syncFromViewButton = document.getElementById("sync-from-view");
syncFromViewButton.addEventListener("click", () => {
    cameraState.position.copy(camera.position);
    cameraState.lookAt.copy(orbit.target);
    cameraState.up.copy(camera.up);
    cameraState.fov = camera.fov;
    populateCameraForm();
    refreshSceneJson();
});

const exportButton = document.getElementById("export-json");
exportButton.addEventListener("click", () => {
    const blob = new Blob([sceneJsonText.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scene.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
});

const copyButton = document.getElementById("copy-json");
copyButton.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(sceneJsonText.value);
        copyButton.textContent = "Copied!";
        setTimeout(() => {
            copyButton.textContent = "Copy";
        }, 1200);
    } catch (error) {
        console.warn("Clipboard unavailable", error);
    }
});

const importInput = document.getElementById("import-json");
importInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            loadSceneFromJson(data);
        } catch (error) {
            alert("Failed to parse scene JSON");
        }
    };
    reader.readAsText(file);
});

function loadSceneFromJson(data) {
    // Clear existing entities
    for (const entity of [...entities]) {
        removeEntity(entity);
    }

    if (data.camera) {
        const cam = data.camera;
        cameraState.position.set(cam.position[0], cam.position[1], cam.position[2]);
        cameraState.lookAt.set(cam.look_at[0], cam.look_at[1], cam.look_at[2]);
        if (cam.up) {
            cameraState.up.set(cam.up[0], cam.up[1], cam.up[2]);
        }
        if (cam.fov) {
            cameraState.fov = cam.fov;
        }
        if (cam.width) {
            cameraState.width = cam.width;
        }
        if (cam.height) {
            cameraState.height = cam.height;
        }
        applyCameraStateToView();
        populateCameraForm();
    }

    if (Array.isArray(data.objects)) {
        for (const obj of data.objects) {
            if (obj.type === "sphere") {
                const geometry = new THREE.SphereGeometry(1, 32, 16);
                const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(...obj.color) });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(obj.center[0], obj.center[1], obj.center[2]);
                const entity = {
                    id: generateId("sphere"),
                    label: "Sphere",
                    kind: "sphere",
                    mesh,
                    data: {
                        center: mesh.position.clone(),
                        radius: obj.radius,
                        color: { r: obj.color[0], g: obj.color[1], b: obj.color[2] },
                    },
                };
                const scale = obj.radius;
                mesh.scale.set(scale, scale, scale);
                scene.add(mesh);
                entities.push(entity);
                addListItem(entity);
            } else if (obj.type === "cube") {
                const width = obj.max[0] - obj.min[0];
                const height = obj.max[1] - obj.min[1];
                const depth = obj.max[2] - obj.min[2];
                const geometry = new THREE.BoxGeometry(width, height, depth);
                const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(...obj.color) });
                const mesh = new THREE.Mesh(geometry, material);
                const center = [
                    (obj.min[0] + obj.max[0]) / 2,
                    (obj.min[1] + obj.max[1]) / 2,
                    (obj.min[2] + obj.max[2]) / 2,
                ];
                mesh.position.set(center[0], center[1], center[2]);
                const entity = {
                    id: generateId("cube"),
                    label: "Cube",
                    kind: "cube",
                    mesh,
                    data: {
                        center: mesh.position.clone(),
                        size: { x: width, y: height, z: depth },
                        color: { r: obj.color[0], g: obj.color[1], b: obj.color[2] },
                    },
                };
                scene.add(mesh);
                entities.push(entity);
                addListItem(entity);
            }
        }
    }

    if (Array.isArray(data.lights)) {
        for (const lightData of data.lights) {
            if (lightData.type === "point") {
                const sphereGeom = new THREE.SphereGeometry(0.12, 16, 8);
                const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
                const marker = new THREE.Mesh(sphereGeom, sphereMat);
                marker.position.set(0, 0, 0);

                const point = new THREE.PointLight(0xffffff, 1.5, 0, 2);
                point.position.set(0, 0, 0);

                const group = new THREE.Group();
                group.add(marker);
                group.add(point);
                const position = lightData.position || [0, 5, 0];
                group.position.set(position[0], position[1], position[2]);
                scene.add(group);

                const entity = {
                    id: generateId("light"),
                    label: "Point Light",
                    kind: "light",
                    mesh: group,
                    helper: marker,
                    light: point,
                    data: {
                        position: group.position.clone(),
                        intensity: {
                            r: lightData.intensity?.[0] ?? 1.0,
                            g: lightData.intensity?.[1] ?? 1.0,
                            b: lightData.intensity?.[2] ?? 1.0,
                        },
                        direction: {
                            x: lightData.direction?.[0] ?? 0.0,
                            y: lightData.direction?.[1] ?? -1.0,
                            z: lightData.direction?.[2] ?? 0.0,
                        },
                    },
                };
                point.color.setRGB(entity.data.intensity.r, entity.data.intensity.g, entity.data.intensity.b);
                entities.push(entity);
                addListItem(entity);
            }
        }
    }

    if (entities.length) {
        selectEntity(entities[entities.length - 1].id);
    } else {
        selectEntity(null);
    }

    refreshSceneJson();
}

// Initialize empty state UI
selectEntity(null);

// Utilities for pointer selection
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const meshes = entities
        .map((e) => e.mesh)
        .filter(Boolean);
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
        let candidate = intersects[0].object;
        let match = null;
        while (candidate && !match) {
            match = entities.find((entity) => entity.mesh === candidate);
            candidate = candidate.parent;
        }
        if (match) {
            selectEntity(match.id);
        }
    }
});
