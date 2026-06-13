package com.learn.pathtracer

import android.graphics.Bitmap
import kotlinx.coroutines.*
import kotlin.math.sqrt

// ─────────────────────────────────────────────
// PathTracer — ядро рендерера.
//
// Архитектура:
//   renderProgressive() — публичный метод, запускает бесконечную петлю
//   накопления сэмплов. Каждая итерация добавляет 1 spp и обновляет bitmap.
//
//   rayColor() — рекурсивная трассировка луча.
//   Ключевое отличие от простого raycaster'а:
//   луч не просто проверяет "попал ли в объект", а "отскакивает" много раз,
//   собирая свет по пути. Именно это даёт мягкие тени, ГИ и каустики.
// ─────────────────────────────────────────────
object PathTracer {

    // ─────────────────────────────────────────────
    // rayColor — сердце path tracer'а.
    //
    // Для каждого луча:
    //  1. Ищем ближайшее пересечение со сценой
    //  2. Если объект светится — добавляем его вклад (emitted)
    //  3. Если материал рассеивает луч — пускаем новый и умножаем цвета
    //  4. Рекурсия до depth=0 (луч "умер") или до промаха (черный фон у Cornell Box)
    //
    // Важно: фон чёрный, свет исходит ТОЛЬКО от DiffuseLight-прямоугольника на потолке.
    // Именно так устроен классический Cornell Box.
    // ─────────────────────────────────────────────
    private fun rayColor(ray: Ray, world: Hittable, depth: Int): Vec3 {
        if (depth <= 0) return Vec3.ZERO

        // tMin = 0.001 — защита от "shadow acne" (ложного самопересечения из-за float-ошибок)
        val hit = world.hit(ray, 0.001, Double.MAX_VALUE)

        if (hit == null) return Vec3.ZERO  // фон чёрный — Cornell Box замкнут

        // Свет от поверхности самой (area light)
        val emitted = hit.material.emitted()

        // Рассеяние — получаем новый луч и коэффициент ослабления
        val scattered = hit.material.scatter(ray, hit)
            ?: return emitted  // нет рассеяния → только свечение

        val (newRay, attenuation) = scattered
        // Рекурсивно: emitted + то что видит рассеянный луч * attenuation материала
        return emitted + attenuation * rayColor(newRay, world, depth - 1)
    }

    // ─────────────────────────────────────────────
    // Progressive rendering — накапливаем сэмплы бесконечно.
    //
    // Идея: вместо того чтобы сразу рендерить N spp,
    // накапливаем каждый новый сэмпл поверх предыдущих в массиве Double.
    // После каждого прохода делим на количество сэмплов → усредняем → показываем.
    // Картинка улучшается непрерывно: сначала зернистая, потом всё чище.
    //
    // Это именно то, как работают production path tracer'ы (Cycles, Arnold, etc.)
    // ─────────────────────────────────────────────
    suspend fun renderProgressive(
        width: Int,
        height: Int,
        maxDepth: Int = 12,
        onSample: (Bitmap, Int) -> Unit  // (bitmap, sampleCount)
    ) = withContext(Dispatchers.Default) {

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val aspectRatio = width.toDouble() / height

        // Аккумуляторы цветов — суммируем все сэмплы сюда
        val accumR = DoubleArray(width * height)
        val accumG = DoubleArray(width * height)
        val accumB = DoubleArray(width * height)

        // ─────────────────────────────────────────────
        // Cornell Box сцена + BVH ускорение
        //
        // Cornell Box — стандартный тест-сцена для path tracer'ов с 1984 г.
        // Замкнутая комната: красная левая стена, зелёная правая, белые пол/потолок/задняя.
        // Источник света — светящийся прямоугольник на потолке.
        // Два белых куба внутри — один повёрнутый, но для простоты делаем axis-aligned.
        // ─────────────────────────────────────────────
        val scene = cornellBox()
        val world = BVHNode(scene.objects, 0, scene.objects.size)

        // Камера смотрит внутрь Cornell Box
        // Cornell Box ориентация: комната от 0 до 555 по каждой оси
        // Камера классически стоит далеко по Z, смотрит на -Z
        val camera = Camera(
            lookFrom    = Vec3(278.0, 278.0, -800.0),
            lookAt      = Vec3(278.0, 278.0, 0.0),
            vUp         = Vec3(0.0, 1.0, 0.0),
            vFov        = 40.0,
            aspectRatio = aspectRatio,
            aperture    = 0.0,   // нет DOF — Cornell Box тест без боке
            focusDist   = 800.0
        )

        var sampleCount = 0

        // Бесконечный цикл накопления сэмплов — прерывается через coroutine cancellation
        while (isActive) {
            sampleCount++

            // Каждый пиксель обрабатывается параллельно (Dispatchers.Default — пул потоков)
            val results = (0 until height).flatMap { j ->
                (0 until width).map { i ->
                    async {
                        // 1 случайный луч на пиксель за один проход
                        val u = (i + Math.random()) / (width - 1)
                        val v = (j + Math.random()) / (height - 1)
                        val ray = camera.getRay(u, v)
                        val color = rayColor(ray, world, maxDepth)
                        Triple(i, j, color)
                    }
                }
            }.awaitAll()

            // Накапливаем в аккумуляторы
            for ((i, j, color) in results) {
                val idx = j * width + i
                accumR[idx] += color.x
                accumG[idx] += color.y
                accumB[idx] += color.z
            }

            // Строим bitmap из усреднённых сэмплов
            for (j in 0 until height) {
                for (i in 0 until width) {
                    val idx = j * width + i
                    val avg = Vec3(
                        accumR[idx] / sampleCount,
                        accumG[idx] / sampleCount,
                        accumB[idx] / sampleCount
                    )
                    // Гамма-коррекция (gamma=2: sqrt переводит линейный → sRGB)
                    val corrected = Vec3(
                        sqrt(avg.x.coerceIn(0.0, 1.0)),
                        sqrt(avg.y.coerceIn(0.0, 1.0)),
                        sqrt(avg.z.coerceIn(0.0, 1.0))
                    )
                    // Bitmap: Y=0 сверху, поэтому переворачиваем j
                    bitmap.setPixel(i, height - 1 - j, corrected.toArgb())
                }
            }

            val snap = bitmap.copy(bitmap.config, false)
            withContext(Dispatchers.Main) {
                onSample(snap, sampleCount)
            }
        }
    }

    // ─────────────────────────────────────────────
    // Cornell Box сцена
    //
    // Координаты взяты из оригинального описания Cornell Box (0..555).
    //
    // Rect(a0, a1, b0, b1, k, axis, mat):
    //   axis=0 → YZ-плоскость (X=k) — боковые стены
    //   axis=1 → XZ-плоскость (Y=k) — пол/потолок
    //   axis=2 → XY-плоскость (Z=k) — задняя стена
    // ─────────────────────────────────────────────
    private fun cornellBox(): HittableList {
        val world = HittableList()

        val red   = Lambertian(Vec3(0.65, 0.05, 0.05))
        val white = Lambertian(Vec3(0.73, 0.73, 0.73))
        val green = Lambertian(Vec3(0.12, 0.45, 0.15))
        val light = DiffuseLight(Vec3(15.0, 15.0, 15.0))
        // Шахматный пол — наглядно показывает как работают процедурные текстуры
        val checker = CheckerLambertian(Vec3(0.9, 0.9, 0.9), Vec3(0.2, 0.2, 0.2), scale = 0.02)

        // Стены
        world.add(Rect(0.0, 555.0, 0.0, 555.0, 555.0, 0, green))   // правая (зелёная)
        world.add(Rect(0.0, 555.0, 0.0, 555.0, 0.0,   0, red))     // левая (красная)
        world.add(Rect(0.0, 555.0, 0.0, 555.0, 0.0,   1, checker)) // пол — шахматный!
        world.add(Rect(0.0, 555.0, 0.0, 555.0, 555.0, 1, white))   // потолок
        world.add(Rect(0.0, 555.0, 0.0, 555.0, 555.0, 2, white))   // задняя стена

        // Источник света на потолке
        world.add(Rect(213.0, 343.0, 227.0, 332.0, 554.0, 1, light))

        // ─────────────────────────────────────────────
        // Два куба с поворотами — настоящий Cornell Box!
        //
        // RotateY поворачивает объект вокруг оси Y.
        // Translate смещает повёрнутый объект на место.
        // Порядок важен: сначала поворот, потом смещение
        // (как в матричных трансформациях: T * R * v)
        // ─────────────────────────────────────────────
        // Короткий куб — повёрнут на -18° (немного влево)
        val shortBox = Translate(
            RotateY(Box(Vec3(0.0, 0.0, 0.0), Vec3(165.0, 165.0, 165.0), white), -18.0),
            Vec3(130.0, 0.0, 65.0)
        )
        // Высокий куб — повёрнут на 15° (немного вправо)
        val tallBox = Translate(
            RotateY(Box(Vec3(0.0, 0.0, 0.0), Vec3(165.0, 330.0, 165.0), white), 15.0),
            Vec3(265.0, 0.0, 295.0)
        )
        world.add(shortBox)
        world.add(tallBox)

        return world
    }

    private fun Vec3.toArgb(): Int {
        val r = (x * 255.99).toInt().coerceIn(0, 255)
        val g = (y * 255.99).toInt().coerceIn(0, 255)
        val b = (z * 255.99).toInt().coerceIn(0, 255)
        return android.graphics.Color.rgb(r, g, b)
    }
}
