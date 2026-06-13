package com.learn.pathtracer

import kotlin.math.tan

/**
 * Камера — генерирует лучи для каждого пикселя экрана.
 *
 * Модель: "pinhole camera" (камера-обскура) с опциональным depth of field.
 *
 * @param lookFrom    позиция камеры
 * @param lookAt      точка, на которую смотрит камера
 * @param vUp         "вверх" для камеры (обычно Vec3(0,1,0))
 * @param vFov        вертикальный угол обзора в градусах
 * @param aspectRatio соотношение сторон экрана (ширина / высота)
 * @param aperture    диаметр "линзы" — чем больше, тем сильнее боке (0 = резко всё)
 * @param focusDist   расстояние до плоскости фокуса
 */
class Camera(
    lookFrom: Vec3,
    lookAt: Vec3,
    vUp: Vec3,
    vFov: Double,
    aspectRatio: Double,
    aperture: Double = 0.0,
    focusDist: Double = 1.0
) {
    private val origin: Vec3
    private val horizontal: Vec3    // вектор вдоль горизонтали viewport'а
    private val vertical: Vec3      // вектор вдоль вертикали viewport'а
    private val lowerLeftCorner: Vec3  // нижний левый угол viewport'а
    private val u: Vec3             // локальные оси камеры
    private val v: Vec3
    private val lensRadius: Double

    init {
        // Преобразуем угол обзора в высоту viewport'а
        val theta = Math.toRadians(vFov)
        val h = tan(theta / 2)
        val viewportHeight = 2.0 * h
        val viewportWidth = aspectRatio * viewportHeight

        // Строим ортонормированный базис для системы координат камеры
        val w = (lookFrom - lookAt).normalize()  // вперёд (к камере)
        u = vUp.cross(w).normalize()              // вправо
        v = w.cross(u)                            // вверх

        origin = lookFrom
        horizontal = u * (viewportWidth * focusDist)
        vertical = v * (viewportHeight * focusDist)

        // Нижний левый угол виртуального экрана перед камерой
        lowerLeftCorner = origin - horizontal / 2.0 - vertical / 2.0 - w * focusDist

        lensRadius = aperture / 2.0
    }

    /**
     * Генерирует луч через пиксель (s, t) на экране.
     * s, t ∈ [0, 1] — нормализованные координаты пикселя.
     * Небольшой случайный offset для anti-aliasing (при многократном вызове).
     */
    fun getRay(s: Double, t: Double): Ray {
        // Для depth of field: луч исходит не из точки, а из случайной точки "линзы"
        val rd = Vec3.randomInUnitDisk() * lensRadius
        val offset = u * rd.x + v * rd.y

        val direction = lowerLeftCorner + horizontal * s + vertical * t - origin - offset
        return Ray(origin + offset, direction)
    }
}
