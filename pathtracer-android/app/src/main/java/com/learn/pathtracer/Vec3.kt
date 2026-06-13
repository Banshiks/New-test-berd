package com.learn.pathtracer

import kotlin.math.sqrt

/**
 * Трёхмерный вектор — основа всего path tracer'а.
 * Используется и для позиций, и для цветов (r=x, g=y, b=z).
 */
data class Vec3(val x: Double, val y: Double, val z: Double) {

    // --- Арифметика ---
    operator fun plus(v: Vec3) = Vec3(x + v.x, y + v.y, z + v.z)
    operator fun minus(v: Vec3) = Vec3(x - v.x, y - v.y, z - v.z)
    operator fun times(t: Double) = Vec3(x * t, y * t, z * t)
    operator fun times(v: Vec3) = Vec3(x * v.x, y * v.y, z * v.z)  // поэлементное умножение
    operator fun div(t: Double) = Vec3(x / t, y / t, z / t)
    operator fun unaryMinus() = Vec3(-x, -y, -z)

    // --- Длина ---
    fun lengthSquared() = x * x + y * y + z * z
    fun length() = sqrt(lengthSquared())

    // --- Нормализация: вектор той же направленности, но длиной 1 ---
    fun normalize(): Vec3 {
        val len = length()
        return if (len > 0) this / len else Vec3(0.0, 0.0, 0.0)
    }

    // --- Скалярное произведение: насколько два вектора "сонаправлены" ---
    // dot > 0: угол < 90°, dot < 0: угол > 90°, dot == 0: перпендикулярны
    fun dot(v: Vec3) = x * v.x + y * v.y + z * v.z

    // --- Векторное произведение: вектор, перпендикулярный двум данным ---
    fun cross(v: Vec3) = Vec3(
        y * v.z - z * v.y,
        z * v.x - x * v.z,
        x * v.y - y * v.x
    )

    // Проверка: вектор почти нулевой? Нужна для избежания NaN
    fun nearZero(): Boolean {
        val eps = 1e-8
        return (kotlin.math.abs(x) < eps) && (kotlin.math.abs(y) < eps) && (kotlin.math.abs(z) < eps)
    }

    companion object {
        val ZERO = Vec3(0.0, 0.0, 0.0)
        val ONE  = Vec3(1.0, 1.0, 1.0)

        // Случайный вектор в единичной сфере — нужен для диффузного рассеивания
        fun randomInUnitSphere(): Vec3 {
            while (true) {
                val v = Vec3(
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1
                )
                if (v.lengthSquared() < 1.0) return v
            }
        }

        // Нормализованный случайный вектор (на поверхности единичной сферы)
        fun randomUnitVector() = randomInUnitSphere().normalize()

        // Случайный вектор в единичном диске (нужен для depth of field камеры)
        fun randomInUnitDisk(): Vec3 {
            while (true) {
                val v = Vec3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.0)
                if (v.lengthSquared() < 1.0) return v
            }
        }
    }
}

// Позволяет писать: 2.0 * vec  (а не только vec * 2.0)
operator fun Double.times(v: Vec3) = v * this
