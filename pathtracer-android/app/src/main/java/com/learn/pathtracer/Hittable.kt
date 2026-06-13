package com.learn.pathtracer

import kotlin.math.min
import kotlin.math.max

data class HitRecord(
    val t: Double,
    val point: Vec3,
    val normal: Vec3,
    val material: Material,
    val frontFace: Boolean
)

interface Hittable {
    fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord?
    fun boundingBox(): AABB?
}

// ─────────────────────────────────────────────
// AABB — ось-выровненный ограничивающий прямоугольник (для BVH)
// Каждый объект оборачивается в AABB.
// BVH проверяет пересечение с AABB ДО проверки с самим объектом —
// это позволяет отсекать целые ветки дерева.
// ─────────────────────────────────────────────
data class AABB(val min: Vec3, val max: Vec3) {
    // Проверка пересечения луча с AABB — алгоритм "slab method"
    // Суть: луч пересекает куб если интервалы пересечений по X, Y, Z перекрываются
    fun hit(ray: Ray, tMin: Double, tMax: Double): Boolean {
        var tLo = tMin
        var tHi = tMax
        for (axis in 0..2) {
            val invD = 1.0 / ray.direction[axis]
            var t0 = (min[axis] - ray.origin[axis]) * invD
            var t1 = (max[axis] - ray.origin[axis]) * invD
            if (invD < 0) { val tmp = t0; t0 = t1; t1 = tmp }
            tLo = max(tLo, t0)
            tHi = min(tHi, t1)
            if (tHi <= tLo) return false
        }
        return true
    }

    companion object {
        // Объединяем два AABB в один — нужно при построении BVH
        fun surrounding(a: AABB, b: AABB) = AABB(
            Vec3(min(a.min.x, b.min.x), min(a.min.y, b.min.y), min(a.min.z, b.min.z)),
            Vec3(max(a.max.x, b.max.x), max(a.max.y, b.max.y), max(a.max.z, b.max.z))
        )
    }
}

// Доступ к Vec3 по индексу оси (0=x, 1=y, 2=z)
operator fun Vec3.get(axis: Int) = when (axis) { 0 -> x; 1 -> y; else -> z }

// ─────────────────────────────────────────────
// Сфера
// ─────────────────────────────────────────────
class Sphere(val center: Vec3, val radius: Double, val material: Material) : Hittable {

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        val oc = ray.origin - center
        val a = ray.direction.lengthSquared()
        val halfB = oc.dot(ray.direction)
        val c = oc.lengthSquared() - radius * radius
        val discriminant = halfB * halfB - a * c
        if (discriminant < 0) return null
        val sqrtD = kotlin.math.sqrt(discriminant)
        var root = (-halfB - sqrtD) / a
        if (root < tMin || root > tMax) {
            root = (-halfB + sqrtD) / a
            if (root < tMin || root > tMax) return null
        }
        val point = ray.at(root)
        val outwardNormal = (point - center) / radius
        val frontFace = ray.direction.dot(outwardNormal) < 0
        return HitRecord(root, point, if (frontFace) outwardNormal else -outwardNormal, material, frontFace)
    }

    override fun boundingBox() = AABB(
        center - Vec3(radius, radius, radius),
        center + Vec3(radius, radius, radius)
    )
}

// ─────────────────────────────────────────────
// Прямоугольник (ось-выровненный) — нужен для Cornell Box
// axis: 0=YZ, 1=XZ, 2=XY
// ─────────────────────────────────────────────
class Rect(
    val a0: Double, val a1: Double,  // диапазон по первой оси
    val b0: Double, val b1: Double,  // диапазон по второй оси
    val k: Double,                   // позиция по третьей оси
    val axis: Int,                   // 0=YZ, 1=XZ, 2=XY
    val material: Material
) : Hittable {

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        // Индексы трёх осей для данного axis
        val (ax0, ax1, axK) = when (axis) {
            0 -> Triple(1, 2, 0)  // YZ-плоскость, k по X
            1 -> Triple(0, 2, 1)  // XZ-плоскость, k по Y
            else -> Triple(0, 1, 2)  // XY-плоскость, k по Z
        }
        val t = (k - ray.origin[axK]) / ray.direction[axK]
        if (t < tMin || t > tMax) return null
        val a = ray.origin[ax0] + t * ray.direction[ax0]
        val b = ray.origin[ax1] + t * ray.direction[ax1]
        if (a < a0 || a > a1 || b < b0 || b > b1) return null
        val point = ray.at(t)
        val outward = when (axis) {
            0 -> Vec3(1.0, 0.0, 0.0)
            1 -> Vec3(0.0, 1.0, 0.0)
            else -> Vec3(0.0, 0.0, 1.0)
        }
        val frontFace = ray.direction.dot(outward) < 0
        return HitRecord(t, point, if (frontFace) outward else -outward, material, frontFace)
    }

    override fun boundingBox(): AABB {
        val eps = 0.0001
        return when (axis) {
            0 -> AABB(Vec3(k - eps, a0, b0), Vec3(k + eps, a1, b1))
            1 -> AABB(Vec3(a0, k - eps, b0), Vec3(a1, k + eps, b1))
            else -> AABB(Vec3(a0, b0, k - eps), Vec3(a1, b1, k + eps))
        }
    }
}

// ─────────────────────────────────────────────
// Box — 6 прямоугольников (для блоков в Cornell Box)
// ─────────────────────────────────────────────
class Box(min: Vec3, max: Vec3, mat: Material) : Hittable {
    private val sides = HittableList().also { s ->
        s.add(Rect(min.x, max.x, min.y, max.y, max.z, 2, mat))  // front
        s.add(Rect(min.x, max.x, min.y, max.y, min.z, 2, mat))  // back
        s.add(Rect(min.x, max.x, min.z, max.z, max.y, 1, mat))  // top
        s.add(Rect(min.x, max.x, min.z, max.z, min.y, 1, mat))  // bottom
        s.add(Rect(min.y, max.y, min.z, max.z, max.x, 0, mat))  // right
        s.add(Rect(min.y, max.y, min.z, max.z, min.x, 0, mat))  // left
    }
    private val box = AABB(min, max)
    override fun hit(ray: Ray, tMin: Double, tMax: Double) = sides.hit(ray, tMin, tMax)
    override fun boundingBox() = box
}

// ─────────────────────────────────────────────
// HittableList — список объектов
// ─────────────────────────────────────────────
class HittableList : Hittable {
    val objects = mutableListOf<Hittable>()
    fun add(obj: Hittable) = objects.add(obj)

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        var closest = tMax
        var result: HitRecord? = null
        for (obj in objects) {
            val hit = obj.hit(ray, tMin, closest)
            if (hit != null) { closest = hit.t; result = hit }
        }
        return result
    }

    override fun boundingBox(): AABB? {
        if (objects.isEmpty()) return null
        var result: AABB? = null
        for (obj in objects) {
            val box = obj.boundingBox() ?: return null
            result = if (result == null) box else AABB.surrounding(result, box)
        }
        return result
    }
}

// ─────────────────────────────────────────────
// BVH — Bounding Volume Hierarchy
//
// Идея: разбиваем список объектов на дерево.
// Каждый узел хранит AABB своих детей.
// При трассировке: если луч НЕ попадает в AABB узла —
// пропускаем ВСЕ объекты внутри (могут быть тысячи!).
// Сложность: O(N) → O(log N) для каждого луча.
// ─────────────────────────────────────────────
class BVHNode(objects: List<Hittable>, start: Int, end: Int) : Hittable {
    private val left: Hittable
    private val right: Hittable
    private val box: AABB

    init {
        // Выбираем случайную ось для разбиения — хороший балансировщик
        val axis = (Math.random() * 3).toInt()
        val comparator: Comparator<Hittable> = Comparator { a, b ->
            val ba = a.boundingBox()?.min?.get(axis) ?: 0.0
            val bb = b.boundingBox()?.min?.get(axis) ?: 0.0
            ba.compareTo(bb)
        }

        val span = end - start
        when (span) {
            1 -> { left = objects[start]; right = objects[start] }
            2 -> {
                if (comparator.compare(objects[start], objects[start + 1]) <= 0) {
                    left = objects[start]; right = objects[start + 1]
                } else {
                    left = objects[start + 1]; right = objects[start]
                }
            }
            else -> {
                val sorted = objects.subList(start, end).sortedWith(comparator)
                val mid = span / 2
                left  = BVHNode(sorted, 0, mid)
                right = BVHNode(sorted, mid, span)
            }
        }
        val boxL = left.boundingBox()
        val boxR = right.boundingBox()
        box = if (boxL != null && boxR != null) AABB.surrounding(boxL, boxR)
              else boxL ?: boxR ?: AABB(Vec3.ZERO, Vec3.ZERO)
    }

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        // Сначала проверяем AABB — быстрая отсечка
        if (!box.hit(ray, tMin, tMax)) return null
        val hitLeft  = left.hit(ray, tMin, tMax)
        val hitRight = right.hit(ray, tMin, hitLeft?.t ?: tMax)
        return hitRight ?: hitLeft
    }

    override fun boundingBox() = box
}
