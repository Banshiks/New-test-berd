package com.learn.pathtracer

import android.graphics.Bitmap
import kotlinx.coroutines.*
import kotlin.math.sqrt

/**
 * Ядро path tracer'а.
 *
 * Главная идея: для каждого пикселя пускаем много лучей (samplesPerPixel),
 * усредняем цвета — получаем плавную картинку без "шума".
 */
object PathTracer {

    /**
     * Цвет луча — рекурсивная функция, суть всего path tracer'а.
     *
     * Алгоритм:
     * 1. Пускаем луч в сцену
     * 2. Если попал в объект — берём его материал, получаем новый луч
     * 3. Рекурсивно считаем цвет нового луча
     * 4. Умножаем на attenuation материала
     * 5. Если ни во что не попали — возвращаем цвет неба (фон)
     *
     * depth — глубина рекурсии: сколько раз луч может "отскочить"
     */
    private fun rayColor(ray: Ray, world: Hittable, depth: Int): Vec3 {
        // Достигли предела отскоков — свет полностью поглощён
        if (depth <= 0) return Vec3.ZERO

        // tMin = 0.001 чтобы избежать "shadow acne" — ложного самопересечения
        val hit = world.hit(ray, 0.001, Double.MAX_VALUE)

        if (hit != null) {
            val scattered = hit.material.scatter(ray, hit)
            return if (scattered != null) {
                val (newRay, attenuation) = scattered
                // Цвет = цвет материала * цвет того, что видит отражённый луч
                attenuation * rayColor(newRay, world, depth - 1)
            } else {
                Vec3.ZERO  // материал поглотил луч
            }
        }

        // Фон: градиент от белого (низ) до голубого (верх) — имитация неба
        val unitDir = ray.direction.normalize()
        val t = 0.5 * (unitDir.y + 1.0)  // преобразуем y ∈ [-1,1] → t ∈ [0,1]
        val white = Vec3(1.0, 1.0, 1.0)
        val blue  = Vec3(0.5, 0.7, 1.0)
        return white * (1.0 - t) + blue * t  // линейная интерполяция (lerp)
    }

    /**
     * Рендерит сцену в Bitmap асинхронно, построчно.
     * onProgress вызывается после каждой строки — для обновления UI.
     */
    suspend fun render(
        width: Int,
        height: Int,
        samplesPerPixel: Int = 10,
        maxDepth: Int = 8,
        onProgress: (Bitmap, Int) -> Unit
    ): Bitmap = withContext(Dispatchers.Default) {

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val aspectRatio = width.toDouble() / height

        // --- Сцена ---
        val world = buildScene()

        // --- Камера ---
        val camera = Camera(
            lookFrom   = Vec3(3.0, 2.0, 5.0),
            lookAt     = Vec3(0.0, 0.5, 0.0),
            vUp        = Vec3(0.0, 1.0, 0.0),
            vFov       = 40.0,
            aspectRatio = aspectRatio,
            aperture   = 0.05,
            focusDist  = 5.5
        )

        // Рендерим построчно (сверху вниз)
        for (j in height - 1 downTo 0) {
            // Внутри строки — параллельно по пикселям
            (0 until width).map { i ->
                async {
                    var pixelColor = Vec3.ZERO

                    // Anti-aliasing: несколько лучей на пиксель со случайным сдвигом
                    repeat(samplesPerPixel) {
                        val u = (i + Math.random()) / (width - 1)
                        val v = (j + Math.random()) / (height - 1)
                        val ray = camera.getRay(u, v)
                        pixelColor = pixelColor + rayColor(ray, world, maxDepth)
                    }

                    // Усредняем и применяем гамма-коррекцию (gamma=2: берём sqrt)
                    // Без гамма-коррекции тёмные цвета выглядят слишком тёмными
                    val color = gammaCorrect(pixelColor / samplesPerPixel.toDouble())
                    Pair(i, color)
                }
            }.awaitAll().forEach { (i, color) ->
                // Bitmap.y=0 — верх экрана, поэтому инвертируем j
                bitmap.setPixel(i, height - 1 - j, color.toArgb())
            }

            // Сообщаем UI о прогрессе после каждой строки
            val progress = ((height - j) * 100) / height
            withContext(Dispatchers.Main) {
                onProgress(bitmap, progress)
            }
        }

        bitmap
    }

    // Гамма-коррекция: приводим линейный цвет к sRGB
    private fun gammaCorrect(color: Vec3): Vec3 = Vec3(
        sqrt(color.x.coerceIn(0.0, 1.0)),
        sqrt(color.y.coerceIn(0.0, 1.0)),
        sqrt(color.z.coerceIn(0.0, 1.0))
    )

    // Конвертация Vec3 (0..1) → Android ARGB Int
    private fun Vec3.toArgb(): Int {
        val r = (x * 255.99).toInt()
        val g = (y * 255.99).toInt()
        val b = (z * 255.99).toInt()
        return android.graphics.Color.rgb(r, g, b)
    }

    /**
     * Учебная сцена: несколько сфер с разными материалами.
     * Здесь можно экспериментировать — добавлять объекты, менять материалы!
     */
    private fun buildScene(): HittableList {
        val world = HittableList()

        // Пол — большая сфера, имитирует плоскость
        world.add(Sphere(
            center   = Vec3(0.0, -100.5, -1.0),
            radius   = 100.0,
            material = Lambertian(Vec3(0.5, 0.5, 0.5))  // серый диффуз
        ))

        // Центральная сфера — стекло
        world.add(Sphere(
            center   = Vec3(0.0, 0.5, 0.0),
            radius   = 0.5,
            material = Dielectric(1.5)
        ))

        // Левая сфера — матовая, тёплый красный
        world.add(Sphere(
            center   = Vec3(-1.2, 0.5, 0.0),
            radius   = 0.5,
            material = Lambertian(Vec3(0.8, 0.2, 0.1))
        ))

        // Правая сфера — золотистый металл
        world.add(Sphere(
            center   = Vec3(1.2, 0.5, 0.0),
            radius   = 0.5,
            material = Metal(Vec3(0.8, 0.6, 0.2), fuzz = 0.1)
        ))

        // Маленькая сфера — тёмный матовый металл
        world.add(Sphere(
            center   = Vec3(0.0, 0.15, 0.8),
            radius   = 0.15,
            material = Metal(Vec3(0.3, 0.3, 0.3), fuzz = 0.5)
        ))

        // Несколько случайных маленьких сфер для интереса
        val rng = java.util.Random(42)
        for (i in -3..3) {
            for (k in -3..3) {
                val center = Vec3(
                    i + 0.6 * rng.nextDouble(),
                    0.15,
                    k + 0.6 * rng.nextDouble() - 1.5
                )
                // Не создаём сферы слишком близко к главным
                if ((center - Vec3(0.0, 0.5, 0.0)).length() < 0.9) continue

                val mat: Material = when (rng.nextInt(3)) {
                    0 -> Lambertian(Vec3(rng.nextDouble(), rng.nextDouble(), rng.nextDouble()))
                    1 -> Metal(Vec3(0.5 + rng.nextDouble() * 0.5, 0.5 + rng.nextDouble() * 0.5, 0.5 + rng.nextDouble() * 0.5), fuzz = rng.nextDouble() * 0.3)
                    else -> Dielectric(1.5)
                }
                world.add(Sphere(center, 0.15, mat))
            }
        }

        return world
    }
}
