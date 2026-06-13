package com.learn.pathtracer

/**
 * Луч: origin + t * direction
 *
 * Вся суть ray tracing'а — пускать лучи и смотреть, во что они попадают.
 * Параметр t — "время" вдоль луча. При t=0 — точка начала, при t=1 — конец direction'а.
 */
data class Ray(val origin: Vec3, val direction: Vec3) {
    // Точка на луче в момент t
    fun at(t: Double): Vec3 = origin + direction * t
}
