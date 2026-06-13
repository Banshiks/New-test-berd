package com.learn.pathtracer

/**
 * Результат пересечения луча с объектом.
 *
 * @param t        параметр вдоль луча (расстояние)
 * @param point    точка пересечения в мировых координатах
 * @param normal   нормаль поверхности в точке пересечения (всегда смотрит "наружу")
 * @param material материал объекта
 * @param frontFace луч попал снаружи или изнутри?
 */
data class HitRecord(
    val t: Double,
    val point: Vec3,
    val normal: Vec3,
    val material: Material,
    val frontFace: Boolean
)

/**
 * Базовый интерфейс для всего, во что может попасть луч.
 */
interface Hittable {
    // tMin/tMax ограничивают диапазон t — так мы избегаем "самопересечения" (acne)
    fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord?
}

/**
 * Сфера — самый простой объект для ray tracing.
 *
 * Математика: луч P(t) = O + t*D пересекает сферу |P - C|² = r²
 * Подставляем и получаем квадратное уравнение относительно t.
 */
class Sphere(
    val center: Vec3,
    val radius: Double,
    val material: Material
) : Hittable {

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        val oc = ray.origin - center         // вектор от центра сферы к началу луча

        // Коэффициенты квадратного уравнения at² + bt + c = 0
        val a = ray.direction.lengthSquared()
        val halfB = oc.dot(ray.direction)    // половина b — упрощает формулу
        val c = oc.lengthSquared() - radius * radius

        // Дискриминант: если < 0, пересечений нет
        val discriminant = halfB * halfB - a * c
        if (discriminant < 0) return null

        val sqrtD = kotlin.math.sqrt(discriminant)

        // Берём ближайший корень в допустимом диапазоне [tMin, tMax]
        var root = (-halfB - sqrtD) / a
        if (root < tMin || root > tMax) {
            root = (-halfB + sqrtD) / a
            if (root < tMin || root > tMax) return null
        }

        val point = ray.at(root)
        val outwardNormal = (point - center) / radius  // нормализованная нормаль

        // Нормаль должна смотреть против луча (для корректного расчёта материалов)
        val frontFace = ray.direction.dot(outwardNormal) < 0
        val normal = if (frontFace) outwardNormal else -outwardNormal

        return HitRecord(root, point, normal, material, frontFace)
    }
}

/**
 * Список объектов — просто находим ближайшее пересечение среди всех.
 */
class HittableList : Hittable {
    val objects = mutableListOf<Hittable>()

    fun add(obj: Hittable) = objects.add(obj)

    override fun hit(ray: Ray, tMin: Double, tMax: Double): HitRecord? {
        var closest = tMax
        var result: HitRecord? = null

        for (obj in objects) {
            val hit = obj.hit(ray, tMin, closest)
            if (hit != null) {
                closest = hit.t  // обновляем максимум — ищем ближайший объект
                result = hit
            }
        }
        return result
    }
}
