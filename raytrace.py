#!/usr/bin/env python3
"""Simple ray tracer that renders scenes defined in JSON."""

import json
import math
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

EPSILON = 1e-5
INF = float('inf')


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float

    def __add__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> "Vec3":
        return Vec3(self.x * scalar, self.y * scalar, self.z * scalar)

    __rmul__ = __mul__

    def __truediv__(self, scalar: float) -> "Vec3":
        return Vec3(self.x / scalar, self.y / scalar, self.z / scalar)

    def dot(self, other: "Vec3") -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: "Vec3") -> "Vec3":
        return Vec3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )

    def length(self) -> float:
        return math.sqrt(self.dot(self))

    def normalized(self) -> "Vec3":
        length = self.length()
        if length == 0:
            return self
        return self / length


@dataclass
class Ray:
    origin: Vec3
    direction: Vec3  # Assumed to be normalized


@dataclass
class HitRecord:
    distance: float
    point: Vec3
    normal: Vec3
    color: Vec3


class SceneObject:
    color: Vec3

    def intersect(self, ray: Ray) -> Optional[HitRecord]:
        raise NotImplementedError


@dataclass
class Sphere(SceneObject):
    center: Vec3
    radius: float
    color: Vec3

    def intersect(self, ray: Ray) -> Optional[HitRecord]:
        oc = ray.origin - self.center
        a = ray.direction.dot(ray.direction)
        b = 2.0 * oc.dot(ray.direction)
        c = oc.dot(oc) - self.radius * self.radius
        discriminant = b * b - 4 * a * c
        if discriminant < 0:
            return None
        sqrt_disc = math.sqrt(discriminant)
        root = (-b - sqrt_disc) / (2 * a)
        if root < EPSILON:
            root = (-b + sqrt_disc) / (2 * a)
            if root < EPSILON:
                return None
        hit_point = ray.origin + ray.direction * root
        normal = (hit_point - self.center).normalized()
        return HitRecord(distance=root, point=hit_point, normal=normal, color=self.color)


@dataclass
class Cube(SceneObject):
    minimum: Vec3
    maximum: Vec3
    color: Vec3

    def intersect(self, ray: Ray) -> Optional[HitRecord]:
        axis_tests = (
            self._axis_intersection(ray.origin.x, ray.direction.x, self.minimum.x, self.maximum.x),
            self._axis_intersection(ray.origin.y, ray.direction.y, self.minimum.y, self.maximum.y),
            self._axis_intersection(ray.origin.z, ray.direction.z, self.minimum.z, self.maximum.z),
        )

        t_near = -INF
        t_far = INF

        for result in axis_tests:
            if result is None:
                return None
            axis_near, axis_far = result
            t_near = max(t_near, axis_near)
            t_far = min(t_far, axis_far)
            if t_near > t_far:
                return None

        if t_far < EPSILON:
            return None

        distance = t_near if t_near >= EPSILON else t_far
        if distance < EPSILON:
            return None

        hit_point = ray.origin + ray.direction * distance
        normal = self._compute_normal(hit_point)
        return HitRecord(distance=distance, point=hit_point, normal=normal, color=self.color)

    def _axis_intersection(self, origin_val: float, direction_val: float, min_val: float, max_val: float) -> Optional[Tuple[float, float]]:
        if abs(direction_val) < EPSILON:
            if origin_val < min_val or origin_val > max_val:
                return None
            return -INF, INF
        inv_dir = 1.0 / direction_val
        t0 = (min_val - origin_val) * inv_dir
        t1 = (max_val - origin_val) * inv_dir
        if t0 > t1:
            t0, t1 = t1, t0
        return t0, t1

    def _compute_normal(self, point: Vec3) -> Vec3:
        # Determine which face was hit by checking proximity to each plane.
        if abs(point.x - self.minimum.x) < EPSILON:
            return Vec3(-1, 0, 0)
        if abs(point.x - self.maximum.x) < EPSILON:
            return Vec3(1, 0, 0)
        if abs(point.y - self.minimum.y) < EPSILON:
            return Vec3(0, -1, 0)
        if abs(point.y - self.maximum.y) < EPSILON:
            return Vec3(0, 1, 0)
        if abs(point.z - self.minimum.z) < EPSILON:
            return Vec3(0, 0, -1)
        return Vec3(0, 0, 1)


@dataclass
class PointLight:
    position: Vec3
    intensity: Vec3


@dataclass
class Camera:
    position: Vec3
    look_at: Vec3
    up: Vec3
    fov: float
    width: int
    height: int

    def generate_ray(self, pixel_x: int, pixel_y: int) -> Ray:
        aspect_ratio = self.width / self.height
        theta = math.radians(self.fov)
        half_height = math.tan(theta / 2)
        half_width = aspect_ratio * half_height

        w = (self.look_at - self.position).normalized()
        u = w.cross(self.up).normalized()
        v = u.cross(w)

        px = (2 * ((pixel_x + 0.5) / self.width) - 1) * half_width
        py = (1 - 2 * ((pixel_y + 0.5) / self.height)) * half_height

        direction = (w + px * u + py * v).normalized()
        return Ray(origin=self.position, direction=direction)


@dataclass
class Scene:
    camera: Camera
    objects: List[SceneObject]
    lights: List[PointLight]


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def trace_ray(scene: Scene, ray: Ray) -> Vec3:
    hit: Optional[HitRecord] = None
    for obj in scene.objects:
        candidate = obj.intersect(ray)
        if candidate and (hit is None or candidate.distance < hit.distance):
            hit = candidate

    if hit is None:
        return Vec3(0, 0, 0)

    color = hit.color * 0.1  # ambient term
    for light in scene.lights:
        light_dir = (light.position - hit.point)
        light_distance = light_dir.length()
        light_dir = light_dir / light_distance

        # Shadow ray
        shadow_origin = hit.point + hit.normal * EPSILON
        shadow_ray = Ray(shadow_origin, light_dir)
        if is_in_shadow(scene, shadow_ray, light_distance):
            continue

        diffuse_strength = max(hit.normal.dot(light_dir), 0.0)
        contribution = Vec3(
            hit.color.x * light.intensity.x,
            hit.color.y * light.intensity.y,
            hit.color.z * light.intensity.z,
        ) * diffuse_strength
        color += contribution

    return Vec3(
        clamp(color.x, 0.0, 1.0),
        clamp(color.y, 0.0, 1.0),
        clamp(color.z, 0.0, 1.0),
    )


def is_in_shadow(scene: Scene, ray: Ray, max_distance: float) -> bool:
    for obj in scene.objects:
        hit = obj.intersect(ray)
        if hit and hit.distance < max_distance:
            return True
    return False


def render(scene: Scene) -> List[List[Vec3]]:
    pixels: List[List[Vec3]] = []
    for y in range(scene.camera.height):
        row: List[Vec3] = []
        for x in range(scene.camera.width):
            ray = scene.camera.generate_ray(x, y)
            color = trace_ray(scene, ray)
            row.append(color)
        pixels.append(row)
    return pixels


def write_ppm(path: str, pixels: List[List[Vec3]]) -> None:
    height = len(pixels)
    width = len(pixels[0]) if height else 0
    with open(path, "w", encoding="ascii") as handle:
        handle.write(f"P3\n{width} {height}\n255\n")
        for row in pixels:
            line_components = []
            for color in row:
                r = int(clamp(color.x, 0.0, 1.0) * 255)
                g = int(clamp(color.y, 0.0, 1.0) * 255)
                b = int(clamp(color.z, 0.0, 1.0) * 255)
                line_components.append(f"{r} {g} {b}")
            handle.write(" ".join(line_components) + "\n")


def parse_vec3(data: List[float]) -> Vec3:
    if len(data) != 3:
        raise ValueError("Vec3 requires three components")
    return Vec3(float(data[0]), float(data[1]), float(data[2]))


def load_scene(path: str) -> Scene:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    camera_data = data.get("camera")
    if not camera_data:
        raise ValueError("Scene JSON must include a camera")

    camera = Camera(
        position=parse_vec3(camera_data["position"]),
        look_at=parse_vec3(camera_data["look_at"]),
        up=parse_vec3(camera_data.get("up", [0, 1, 0])),
        fov=float(camera_data.get("fov", 60)),
        width=int(camera_data.get("width", 320)),
        height=int(camera_data.get("height", 240)),
    )

    objects: List[SceneObject] = []
    for obj_data in data.get("objects", []):
        obj_type = obj_data.get("type")
        color = parse_vec3(obj_data.get("color", [1, 1, 1]))
        if obj_type == "sphere":
            sphere = Sphere(
                center=parse_vec3(obj_data["center"]),
                radius=float(obj_data["radius"]),
                color=color,
            )
            objects.append(sphere)
        elif obj_type == "cube":
            cube = Cube(
                minimum=parse_vec3(obj_data["min"]),
                maximum=parse_vec3(obj_data["max"]),
                color=color,
            )
            objects.append(cube)
        else:
            raise ValueError(f"Unsupported object type: {obj_type}")

    lights: List[PointLight] = []
    for light_data in data.get("lights", []):
        light_type = light_data.get("type")
        if light_type != "point":
            raise ValueError(f"Unsupported light type: {light_type}")
        lights.append(
            PointLight(
                position=parse_vec3(light_data["position"]),
                intensity=parse_vec3(light_data.get("intensity", [1, 1, 1])),
            )
        )

    return Scene(camera=camera, objects=objects, lights=lights)


def main(argv: List[str]) -> int:
    if len(argv) != 3:
        print("Usage: python3 raytrace.py <scene.json> <output.ppm>", file=sys.stderr)
        return 1

    scene_path = argv[1]
    output_path = argv[2]

    scene = load_scene(scene_path)
    pixels = render(scene)
    write_ppm(output_path, pixels)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
