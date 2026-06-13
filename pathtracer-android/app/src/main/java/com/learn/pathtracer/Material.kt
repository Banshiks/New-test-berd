package com.learn.pathtracer

import kotlin.math.sqrt
import kotlin.math.pow

interface Material {
    fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3>?
    // Свечение: большинство материалов не светятся, возвращают ZERO
    fun emitted(): Vec3 = Vec3.ZERO
}

// Ламбертовский диффуз — матовые поверхности, рассеивают свет случайно
class Lambertian(val albedo: Vec3) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3> {
        var dir = hit.normal + Vec3.randomUnitVector()
        if (dir.nearZero()) dir = hit.normal
        return Pair(Ray(hit.point, dir), albedo)
    }
}

// Металл — зеркальное отражение + случайный fuzz
class Metal(val albedo: Vec3, val fuzz: Double = 0.0) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3>? {
        val reflected = reflect(ray.direction.normalize(), hit.normal)
        val scattered = Ray(hit.point, reflected + Vec3.randomInUnitSphere() * fuzz.coerceIn(0.0, 1.0))
        return if (scattered.direction.dot(hit.normal) > 0) Pair(scattered, albedo) else null
    }
}

// Диэлектрик — стекло/вода, преломление по закону Снеллиуса
class Dielectric(val ir: Double) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3> {
        val ratio = if (hit.frontFace) 1.0 / ir else ir
        val unit = ray.direction.normalize()
        val cos = minOf(-unit.dot(hit.normal), 1.0)
        val sin = sqrt(1.0 - cos * cos)
        val dir = if (ratio * sin > 1.0 || schlick(cos, ratio) > Math.random())
            reflect(unit, hit.normal) else refract(unit, hit.normal, ratio)
        return Pair(Ray(hit.point, dir), Vec3(1.0, 1.0, 1.0))
    }
    private fun schlick(cos: Double, ref: Double): Double {
        var r0 = (1 - ref) / (1 + ref); r0 *= r0
        return r0 + (1 - r0) * (1 - cos).pow(5)
    }
}

// ─────────────────────────────────────────────
// DiffuseLight — светящийся материал (источник света)
//
// Физика: emit() возвращает цвет×яркость.
// scatter() возвращает null — луч поглощается, не отражается.
// Именно это делает объект источником света:
// когда луч попадает сюда, он "видит" свет напрямую.
// ─────────────────────────────────────────────
class DiffuseLight(val color: Vec3) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3>? = null
    override fun emitted(): Vec3 = color
}

// ─────────────────────────────────────────────
// CheckerTexture — процедурная шахматная текстура.
// Цвет зависит от координат точки пересечения.
// sin(x)*sin(y)*sin(z) < 0 → одна клетка, иначе другая.
// ─────────────────────────────────────────────
class CheckerLambertian(val even: Vec3, val odd: Vec3, val scale: Double = 1.0) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3> {
        val s = hit.point * scale
        val checker = kotlin.math.sin(s.x) * kotlin.math.sin(s.y) * kotlin.math.sin(s.z)
        val albedo = if (checker < 0) odd else even
        var dir = hit.normal + Vec3.randomUnitVector()
        if (dir.nearZero()) dir = hit.normal
        return Pair(Ray(hit.point, dir), albedo)
    }
}

fun reflect(v: Vec3, n: Vec3): Vec3 = v - n * (2.0 * v.dot(n))

fun refract(uv: Vec3, n: Vec3, eta: Double): Vec3 {
    val cos = minOf(-uv.dot(n), 1.0)
    val perp = (uv + n * cos) * eta
    val par = n * (-sqrt(kotlin.math.abs(1.0 - perp.lengthSquared())))
    return perp + par
}
