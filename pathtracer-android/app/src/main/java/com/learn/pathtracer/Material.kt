package com.learn.pathtracer

import kotlin.math.sqrt
import kotlin.math.pow

/**
 * Материал определяет, что происходит с лучом при столкновении с поверхностью.
 * Возвращает: новый луч (scattered) + ослабление цвета (attenuation).
 * Если null — луч поглощён (не отражается).
 */
interface Material {
    fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3>?
}

/**
 * Ламбертовский диффузный материал — матовые поверхности.
 *
 * Физика: свет рассеивается равномерно во все стороны (полусферу).
 * Цвет зависит от albedo (альбедо) — коэффициента отражения.
 *
 * Почему "path tracing"? Потому что мы случайно выбираем направление
 * и усредняем результат по тысячам сэмплов — получаем GI (global illumination)
 * бесплатно!
 */
class Lambertian(val albedo: Vec3) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3> {
        // Случайное направление в полусфере — суть диффузного отражения
        var scatterDir = hit.normal + Vec3.randomUnitVector()

        // Защита от вырожденного случая (нормаль и случайный вектор противоположны)
        if (scatterDir.nearZero()) scatterDir = hit.normal

        return Pair(Ray(hit.point, scatterDir), albedo)
    }
}

/**
 * Металл — зеркальное отражение с опциональной "размытостью" (fuzz).
 *
 * Физика: угол падения = угол отражения, но с небольшим случайным отклонением.
 * fuzz = 0: идеальное зеркало, fuzz = 1: очень матовый металл.
 */
class Metal(val albedo: Vec3, val fuzz: Double = 0.0) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3>? {
        // Формула отражения: r = d - 2*(d·n)*n
        val reflected = reflect(ray.direction.normalize(), hit.normal)

        // Добавляем случайное отклонение для матовости
        val scattered = Ray(hit.point, reflected + Vec3.randomInUnitSphere() * fuzz.coerceIn(0.0, 1.0))

        // Луч должен уходить "наружу" от поверхности
        return if (scattered.direction.dot(hit.normal) > 0)
            Pair(scattered, albedo)
        else
            null  // луч ушёл "в" поверхность — поглощён
    }
}

/**
 * Диэлектрик — прозрачное стекло/вода.
 *
 * Физика: луч частично отражается, частично преломляется (закон Снеллиуса).
 * Соотношение отражение/преломление зависит от угла (уравнение Шлика).
 *
 * ir = index of refraction (показатель преломления):
 *   - воздух: 1.0
 *   - стекло: 1.5
 *   - вода:   1.33
 *   - алмаз:  2.4
 */
class Dielectric(val ir: Double) : Material {
    override fun scatter(ray: Ray, hit: HitRecord): Pair<Ray, Vec3> {
        val attenuation = Vec3(1.0, 1.0, 1.0)  // стекло не поглощает цвет

        // Луч входит снаружи или изнутри?
        val refractionRatio = if (hit.frontFace) 1.0 / ir else ir

        val unitDir = ray.direction.normalize()
        val cosTheta = minOf(-unitDir.dot(hit.normal), 1.0)
        val sinTheta = sqrt(1.0 - cosTheta * cosTheta)

        // Полное внутреннее отражение: если угол слишком большой, преломления нет
        val cannotRefract = refractionRatio * sinTheta > 1.0

        val direction = when {
            cannotRefract || schlick(cosTheta, refractionRatio) > Math.random() ->
                reflect(unitDir, hit.normal)      // отражение
            else ->
                refract(unitDir, hit.normal, refractionRatio)  // преломление
        }

        return Pair(Ray(hit.point, direction), attenuation)
    }

    // Аппроксимация Шлика: вероятность отражения зависит от угла
    // При скользящем угле (cosTheta → 0) отражение становится сильнее
    private fun schlick(cosTheta: Double, refIdx: Double): Double {
        var r0 = (1 - refIdx) / (1 + refIdx)
        r0 = r0 * r0
        return r0 + (1 - r0) * (1 - cosTheta).pow(5)
    }
}

// --- Вспомогательные функции ---

// Формула отражения: v - 2*(v·n)*n
fun reflect(v: Vec3, n: Vec3): Vec3 = v - n * (2.0 * v.dot(n))

// Формула преломления (закон Снеллиуса в векторной форме)
fun refract(uv: Vec3, n: Vec3, etaiOverEtat: Double): Vec3 {
    val cosTheta = minOf(-uv.dot(n), 1.0)
    val rOutPerp = (uv + n * cosTheta) * etaiOverEtat
    val rOutParallel = n * (-sqrt(kotlin.math.abs(1.0 - rOutPerp.lengthSquared())))
    return rOutPerp + rOutParallel
}
